import { randomUUID } from 'node:crypto';

export function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

export function userRepository(pool) {
  return {
    async create({ email, displayName, passwordHash }) {
      const result = await pool.query(`INSERT INTO users(id, email, display_name, password_hash)
        VALUES ($1, $2, $3, $4) RETURNING *`, [randomUUID(), email, displayName, passwordHash]);
      return result.rows[0];
    },
    async byEmail(email) {
      return (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    },
    async byId(id) {
      return (await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
    },
  };
}
