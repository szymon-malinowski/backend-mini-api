import { randomUUID } from 'node:crypto';

const select = `SELECT p.*, u.display_name FROM posts p JOIN users u ON u.id = p.author_id`;
function serialize(row) {
  if (!row) return undefined;
  return { id: row.id, title: row.title, body: row.body,
    author: { id: row.author_id, displayName: row.display_name },
    createdAt: row.created_at, updatedAt: row.updated_at };
}

export function postRepository(pool) {
  return {
    async list({ page, limit }) {
      // One snapshot keeps the total and page consistent under concurrent writes.
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const count = await client.query('SELECT count(*)::int AS total FROM posts');
        const result = await client.query(`${select} ORDER BY p.created_at DESC, p.id DESC LIMIT $1 OFFSET $2`,
          [limit, (page - 1) * limit]);
        await client.query('COMMIT');
        return { data: result.rows.map(serialize), pagination: { page, limit, total: count.rows[0].total } };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(id) {
      return serialize((await pool.query(`${select} WHERE p.id = $1`, [id])).rows[0]);
    },
    async create(authorId, { title, body }) {
      const id = randomUUID();
      await pool.query('INSERT INTO posts(id, author_id, title, body) VALUES ($1, $2, $3, $4)',
        [id, authorId, title, body]);
      return this.get(id);
    },
    async update(id, authorId, { title, body }) {
      const result = await pool.query(`UPDATE posts SET title = COALESCE($3, title), body = COALESCE($4, body)
        WHERE id = $1 AND author_id = $2 RETURNING id`, [id, authorId, title ?? null, body ?? null]);
      return result.rowCount ? this.get(id) : undefined;
    },
    async delete(id, authorId) {
      return (await pool.query('DELETE FROM posts WHERE id = $1 AND author_id = $2', [id, authorId])).rowCount;
    },
  };
}
