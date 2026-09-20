import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool } from './pool.js';

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73491542)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const directory = new URL('./migrations/', import.meta.url);
    const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
    for (const name of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
    console.log('PostgreSQL migrations applied.');
  } finally {
    await pool.end();
  }
}
