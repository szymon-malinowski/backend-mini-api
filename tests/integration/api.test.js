import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import argon2 from 'argon2';
import { createPool } from '../../src/db/pool.js';
import { migrate } from '../../src/db/migrate.js';
import { readConfig } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a disposable PostgreSQL database whose name ends with _test.');
}
if (process.env.DATABASE_URL) {
  const main = new URL(process.env.DATABASE_URL);
  const target = new URL(url);
  if (main.host === target.host && main.pathname === target.pathname) throw new Error('Test and application databases must differ.');
}

test('PostgreSQL API integration', async t => {
  const pool = createPool(url);
  let app;
  const otherApps = [];
  const logs = [];
  const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url,
    SESSION_SECRET: randomBytes(48).toString('hex'), GLOBAL_RATE_LIMIT: '1000', AUTH_RATE_LIMIT: '100' });
  t.after(async () => {
    app?.locals.close();
    otherApps.forEach(instance => instance.locals.close());
    await pool.end();
  });
  await migrate(pool);
  await pool.query('TRUNCATE posts, users, sessions, rate_limits CASCADE');
  app = await createApp({ pool, config, logger: { error: value => logs.push(value) } });
  const api = '/api/v1';
  const password = 'correct horse battery staple';

  async function newUser(email = `${randomUUID()}@example.com`) {
    const agent = request.agent(app);
    let token = (await agent.get(`${api}/auth/csrf`).expect(200)).body.data.csrfToken;
    const registered = await agent.post(`${api}/auth/register`).set('X-CSRF-Token', token)
      .send({ email, displayName: 'Alex', password }).expect(201);
    const login = await agent.post(`${api}/auth/login`).set('X-CSRF-Token', token).send({ email, password }).expect(200);
    token = (await agent.get(`${api}/auth/csrf`).expect(200)).body.data.csrfToken;
    return { agent, token, id: registered.body.data.id, email, cookie: login.headers['set-cookie'][0].split(';')[0] };
  }
  const owner = await newUser();
  const other = await newUser();
  let post;

  await t.test('migrations are repeatable and database constraints are enforced', async () => {
    await migrate(pool);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
    await assert.rejects(pool.query('INSERT INTO posts(id, author_id, title, body) VALUES ($1, $2, $3, $4)',
      [randomUUID(), randomUUID(), 'Title', 'Body']), { code: '23503' });
    await assert.rejects(pool.query('INSERT INTO posts(id, author_id, title, body) VALUES ($1, $2, $3, $4)',
      [randomUUID(), owner.id, ' ', 'Body']), { code: '23514' });
    await assert.rejects(pool.query('INSERT INTO posts(id, author_id, title, body) VALUES ($1, $2, $3, $4)',
      [randomUUID(), owner.id, 'Title', '\n\t ']), { code: '23514' });
  });

  await t.test('registration normalizes email, hashes passwords, rejects duplicates, and does not log in', async () => {
    const agent = request.agent(app);
    const token = (await agent.get(`${api}/auth/csrf`)).body.data.csrfToken;
    const email = '  NORMALIZED@EXAMPLE.COM  ';
    const response = await agent.post(`${api}/auth/register`).set('X-CSRF-Token', token)
      .send({ email, displayName: '  Example  ', password }).expect(201);
    assert.equal(response.body.data.email, 'normalized@example.com');
    assert.equal(response.body.data.displayName, 'Example');
    assert.equal(response.body.data.password_hash, undefined);
    const row = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [response.body.data.id])).rows[0];
    assert.match(row.password_hash, /^\$argon2id\$/);
    assert.ok(await argon2.verify(row.password_hash, password));
    await agent.get(`${api}/users/me`).expect(401);
    await agent.post(`${api}/auth/register`).set('X-CSRF-Token', token)
      .send({ email: 'normalized@example.com', displayName: 'Example', password }).expect(409);
  });

  await t.test('login rotates session and CSRF token and uses generic credential errors', async () => {
    const agent = request.agent(app);
    const before = await agent.get(`${api}/auth/csrf`).expect(200);
    const oldToken = before.body.data.csrfToken;
    const oldCookie = before.headers['set-cookie'][0].split(';')[0];
    const invalid = await agent.post(`${api}/auth/login`).set('X-CSRF-Token', oldToken)
      .send({ email: owner.email, password: 'wrong password with enough characters' }).expect(401);
    const unknown = await agent.post(`${api}/auth/login`).set('X-CSRF-Token', oldToken)
      .send({ email: 'missing@example.com', password }).expect(401);
    assert.deepEqual(unknown.body, invalid.body);
    const login = await agent.post(`${api}/auth/login`).set('X-CSRF-Token', oldToken)
      .send({ email: owner.email, password }).expect(200);
    assert.notEqual(login.headers['set-cookie'][0].split(';')[0], oldCookie);
    assert.match(login.headers['set-cookie'][0], /HttpOnly/);
    assert.match(login.headers['set-cookie'][0], /SameSite=Lax/);
    const after = await agent.get(`${api}/auth/csrf`).expect(200);
    assert.notEqual(after.body.data.csrfToken, oldToken);
    await agent.post(`${api}/posts`).set('X-CSRF-Token', oldToken).send({ title: 'Title', body: 'Body' }).expect(403);
    await request(app).get(`${api}/users/me`).set('Cookie', oldCookie).expect(401);
  });

  await t.test('anonymous writes fail and authenticated writes require CSRF', async () => {
    await request(app).post(`${api}/posts`).send({ title: 'Title', body: 'Body' }).expect(401);
    await owner.agent.post(`${api}/posts`).send({ title: 'Title', body: 'Body' }).expect(403);
    await owner.agent.post(`${api}/posts`).set('X-CSRF-Token', 'x'.repeat(64)).send({ title: 'Title', body: 'Body' }).expect(403);
    await request(app).post(`${api}/auth/register`).send({}).expect(403);
    await request(app).post(`${api}/auth/login`).send({}).expect(403);
  });

  await t.test('create and read posts without leaking private user data', async () => {
    const response = await owner.agent.post(`${api}/posts`).set('X-CSRF-Token', owner.token)
      .send({ title: '  First post  ', body: 'Public body' }).expect(201);
    post = response.body.data;
    assert.equal(response.headers.location, `${api}/posts/${post.id}`);
    assert.equal(post.title, 'First post');
    assert.deepEqual(Object.keys(post.author).sort(), ['displayName', 'id']);
    assert.equal(post.author.id, owner.id);
    assert.match(post.createdAt, /Z$/);
    const read = await request(app).get(`${api}/posts/${post.id}`).expect(200);
    assert.deepEqual(read.body.data, post);
    const profile = await owner.agent.get(`${api}/users/me`).expect(200);
    assert.equal(profile.body.data.id, owner.id);
    assert.equal(profile.body.data.email, owner.email);
  });

  await t.test('ownership and database foreign key prevent unauthorized changes', async () => {
    await other.agent.patch(`${api}/posts/${post.id}`).set('X-CSRF-Token', other.token).send({ title: 'Stolen' }).expect(403);
    await other.agent.delete(`${api}/posts/${post.id}`).set('X-CSRF-Token', other.token).expect(403);
    await owner.agent.patch(`${api}/posts/${post.id}`).set('X-CSRF-Token', owner.token).send({ authorId: other.id }).expect(400);
    await owner.agent.post(`${api}/posts`).set('X-CSRF-Token', owner.token)
      .send({ title: 'Title', body: 'Body', authorId: other.id }).expect(400);
    await assert.rejects(pool.query('DELETE FROM users WHERE id = $1', [owner.id]), error =>
      ['23001', '23503'].includes(error.code) && error.constraint === 'posts_author_id_fkey');
  });

  await t.test('partial updates preserve omitted fields and SQL injection strings remain data', async () => {
    const title = "'; DROP TABLE users; --";
    const response = await owner.agent.patch(`${api}/posts/${post.id}`).set('X-CSRF-Token', owner.token).send({ title }).expect(200);
    assert.equal(response.body.data.title, title);
    assert.equal(response.body.data.body, post.body);
    assert.ok(response.body.data.updatedAt >= post.updatedAt);
    assert.ok((await pool.query('SELECT count(*) FROM users')).rows.length);
  });

  await t.test('rejects invalid fields, nulls, empty patches and invalid IDs', async () => {
    for (const body of [{}, { title: null }, { title: '' }, { body: '\n ' }, { body: 'a'.repeat(10001) }, { title: 'x'.repeat(201) }]) {
      await owner.agent.patch(`${api}/posts/${post.id}`).set('X-CSRF-Token', owner.token).send(body).expect(400);
    }
    await request(app).get(`${api}/posts/not-a-uuid`).expect(400);
    await request(app).get(`${api}/posts/${randomUUID()}`).expect(404);
    await owner.agent.delete(`${api}/posts/${randomUUID()}`).set('X-CSRF-Token', owner.token).expect(404);
    await request(app).get('/missing').expect(404);
    for (const value of ['short', 'x'.repeat(129)]) {
      await owner.agent.post(`${api}/auth/register`).set('X-CSRF-Token', owner.token)
        .send({ email: 'valid@example.com', displayName: 'Test', password: value }).expect(400);
    }
  });

  await t.test('pagination validates integers, limits results, and has stable ordering', async () => {
    for (let i = 0; i < 3; i++) {
      await owner.agent.post(`${api}/posts`).set('X-CSRF-Token', owner.token).send({ title: `Post ${i}`, body: 'Body' }).expect(201);
    }
    await pool.query("UPDATE posts SET created_at = '2026-09-20T00:00:00Z'");
    const first = await request(app).get(`${api}/posts?page=1&limit=2`).expect(200);
    const second = await request(app).get(`${api}/posts?page=2&limit=2`).expect(200);
    assert.equal(first.body.pagination.total, 4);
    const ids = [...first.body.data, ...second.body.data].map(p => p.id);
    assert.equal(new Set(ids).size, 4);
    assert.deepEqual(ids, [...ids].sort().reverse());
    assert.deepEqual((await request(app).get(`${api}/posts?page=999`)).body.data, []);
    for (const query of ['page=0', 'page=-1', 'limit=101', 'page=1.5', 'page=1e2', 'page=1&page=2', 'page=999999999999999999999', 'unknown=x']) {
      await request(app).get(`${api}/posts?${query}`).expect(400);
    }
  });

  await t.test('rejects invalid JSON, oversized bodies, content types and disallowed origins', async () => {
    await owner.agent.post(`${api}/posts`).set('Content-Type', 'application/json').send('{').expect(400);
    await owner.agent.post(`${api}/posts`).set('X-CSRF-Token', owner.token).send({ body: 'x'.repeat(65536) }).expect(413);
    await owner.agent.post(`${api}/posts`).set('Content-Type', 'text/plain').send('text').expect(415);
    await owner.agent.post(`${api}/posts`).set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', owner.token).send({ title: 'Title', body: 'Body' }).expect(403);
    const response = await request(app).get(`${api}/posts`).expect(200);
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  await t.test('application recreation preserves posts and PostgreSQL sessions', async () => {
    const restarted = await createApp({ pool, config });
    otherApps.push(restarted);
    await request(restarted).get(`${api}/posts/${post.id}`).expect(200);
    await request(restarted).get(`${api}/users/me`).set('Cookie', owner.cookie).expect(200);
    assert.ok((await pool.query('SELECT 1 FROM sessions')).rowCount > 0);
  });

  await t.test('absolute session expiry rejects an otherwise valid stored session', async () => {
    const user = await newUser();
    await pool.query(`UPDATE sessions SET sess = jsonb_set(sess::jsonb, '{expiresAt}', '1'::jsonb)::json
      WHERE sess->>'userId' = $1`, [user.id]);
    await user.agent.get(`${api}/users/me`).expect(401);
    await user.agent.post(`${api}/posts`).set('X-CSRF-Token', user.token).send({ title: 'Title', body: 'Body' }).expect(401);
  });

  await t.test('database expiry and logout prevent cookie replay', async () => {
    const expired = await newUser();
    await pool.query("UPDATE sessions SET expire = now() - interval '1 second' WHERE sess->>'userId' = $1", [expired.id]);
    await request(app).get(`${api}/users/me`).set('Cookie', expired.cookie).expect(401);
    const user = await newUser();
    const response = await user.agent.post(`${api}/auth/logout`).set('X-CSRF-Token', user.token).expect(204);
    assert.equal(response.text, '');
    assert.match(response.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
    await request(app).get(`${api}/users/me`).set('Cookie', user.cookie).expect(401);
    assert.equal((await pool.query("SELECT 1 FROM sessions WHERE sess->>'userId' = $1", [user.id])).rowCount, 0);
  });

  await t.test('author deletes a post and subsequent retrieval returns 404', async () => {
    const response = await owner.agent.delete(`${api}/posts/${post.id}`).set('X-CSRF-Token', owner.token).expect(204);
    assert.equal(response.text, '');
    await request(app).get(`${api}/posts/${post.id}`).expect(404);
  });

  await t.test('rate limits are shared across app instances and recover after expiry', async () => {
    await pool.query('TRUNCATE rate_limits');
    const limitedConfig = { ...config, globalRateLimit: 2, authRateLimit: 1 };
    const a = await createApp({ pool, config: limitedConfig });
    const b = await createApp({ pool, config: limitedConfig });
    otherApps.push(a, b);
    await request(a).get(`${api}/posts`).expect(200);
    await request(b).get(`${api}/posts`).expect(200);
    const limited = await request(a).get(`${api}/posts`).expect(429);
    assert.ok(Number(limited.headers['retry-after']) > 0);
    await pool.query("UPDATE rate_limits SET expires_at = now() - interval '1 second'");
    await request(b).get(`${api}/posts`).expect(200);
    await pool.query('TRUNCATE rate_limits');
    await request(a).post(`${api}/auth/login`).send({}).expect(403);
    await request(b).post(`${api}/auth/register`).send({}).expect(429);
    await pool.query('TRUNCATE rate_limits');
  });

  await t.test('production requires HTTPS and issues secure cookies through an explicitly trusted proxy', async () => {
    const production = await createApp({ pool, config: { ...config, production: true,
      appOrigin: 'https://api.example.com', corsOrigins: ['https://app.example.com'], trustProxy: ['127.0.0.1/32', '::1/128'] } });
    otherApps.push(production);
    await request(production).get(`${api}/auth/csrf`).expect(403);
    const response = await request(production).get(`${api}/auth/csrf`).set('X-Forwarded-Proto', 'https').expect(200);
    assert.match(response.headers['set-cookie'][0], /Secure/);
    await request(app).get(`${api}/posts`).set('X-Forwarded-For', '203.0.113.1').expect(200);
    const cors = await request(production).options(`${api}/posts`).set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://app.example.com').set('Access-Control-Request-Method', 'POST').expect(204);
    assert.equal(cors.headers['access-control-allow-origin'], 'https://app.example.com');
    assert.equal(cors.headers['access-control-allow-credentials'], 'true');
  });

  await t.test('unexpected database failures do not leak details or credentials', async () => {
    const broken = await createApp({ pool: { query: async () => { throw new Error('password=secret SELECT * FROM users'); } },
      config, logger: { error: value => logs.push(value) } });
    otherApps.push(broken);
    const response = await request(broken).get(`${api}/posts`).expect(500);
    assert.deepEqual(response.body, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    assert.ok(!JSON.stringify(logs).includes('secret'));
    assert.ok(!JSON.stringify(logs).includes('SELECT'));
    assert.equal(logs.length, 1);
  });
});
