import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { apiRouter } from './routes/api.js';
import { authService } from './services/auth.js';
import { postService } from './services/posts.js';
import { ApiError, errorHandler } from './middleware/errors.js';
import { cookieOptions, expireSession, requireJson, SESSION_TTL, transportSecurity } from './middleware/security.js';
import { rateLimit } from './middleware/rate-limit.js';

export async function createApp({ pool, config, logger = console }) {
  const app = express();
  app.locals.config = config;
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy.length ? config.trustProxy : false);
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set({ 'X-Request-Id': req.id, 'Cache-Control': 'no-store' });
    next();
  });
  app.use(helmet());
  app.use(transportSecurity(config));
  if (config.corsOrigins.length) {
    app.use(cors({ origin: config.corsOrigins, credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  }
  app.use(rateLimit(pool, { scope: 'global', limit: config.globalRateLimit,
    windowMs: 60000, secret: config.sessionSecret }));
  app.use(requireJson);
  app.use(express.json({ limit: '64kb', inflate: false }));

  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool, tableName: 'sessions', createTableIfMissing: false,
    pruneSessionInterval: 15 * 60, disableTouch: true,
    errorLog: () => logger.error({ event: 'session_store_failed' }) });
  app.use(session({ name: 'mini.sid', secret: config.sessionSecret, store,
    resave: false, saveUninitialized: false, rolling: false,
    cookie: { ...cookieOptions(config.production), maxAge: SESSION_TTL } }));
  app.use(expireSession);
  app.use('/api/v1', apiRouter({ pool, config, auth: await authService(pool), posts: postService(pool) }));
  app.use((_req, _res) => { throw new ApiError(404, 'NOT_FOUND', 'Route not found.'); });
  app.use(errorHandler(logger));

  const cleanup = setInterval(() => {
    pool.query('DELETE FROM rate_limits WHERE expires_at <= now()')
      .catch(() => logger.error({ event: 'rate_limit_cleanup_failed' }));
  }, 15 * 60 * 1000);
  cleanup.unref();
  app.locals.close = () => { clearInterval(cleanup); store.close(); };
  return app;
}
