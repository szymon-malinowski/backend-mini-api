import { createHmac } from 'node:crypto';
import { ApiError } from './errors.js';

export function rateLimit(pool, { scope, limit, windowMs, secret }) {
  return async (req, res, next) => {
    const key = `${scope}:${createHmac('sha256', secret).update(req.ip).digest('hex')}`;
    const result = await pool.query(`INSERT INTO rate_limits(key, hits, expires_at)
      VALUES ($1, 1, now() + $2 * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        expires_at = CASE WHEN rate_limits.expires_at <= now()
          THEN now() + $2 * interval '1 millisecond' ELSE rate_limits.expires_at END
      RETURNING hits, greatest(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry_after`,
    [key, windowMs]);
    const row = result.rows[0];
    if (row.hits > limit) {
      res.set('Retry-After', String(row.retry_after));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.');
    }
    next();
  };
}
