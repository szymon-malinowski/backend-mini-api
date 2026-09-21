import pg from 'pg';

export const database = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
