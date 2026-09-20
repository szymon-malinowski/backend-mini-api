import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export const SESSION_TTL = 24 * 60 * 60 * 1000;
export const cookieOptions = production => ({ httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
export const sessionAction = (session, action) => new Promise((resolve, reject) => {
  session[action](error => error ? reject(error) : resolve());
});

export function newSessionState(session) {
  session.csrfToken = randomBytes(32).toString('hex');
  session.expiresAt = Date.now() + SESSION_TTL;
}

export async function expireSession(req, res, next) {
  if (req.session?.expiresAt && req.session.expiresAt <= Date.now()) {
    await sessionAction(req.session, 'regenerate');
    res.clearCookie('mini.sid', cookieOptions(req.app.locals.config.production));
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  next();
}

export function requireCsrf(req, _res, next) {
  const token = req.get('X-CSRF-Token');
  const expected = req.session?.csrfToken;
  if (!token || !expected || !/^[a-f0-9]{64}$/.test(token) ||
    !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new ApiError(403, 'INVALID_CSRF_TOKEN', 'Missing or invalid CSRF token.');
  }
  next();
}

export function transportSecurity(config) {
  const allowed = new Set([config.appOrigin, ...config.corsOrigins]);
  return (req, _res, next) => {
    if (config.production && !req.secure) throw new ApiError(403, 'HTTPS_REQUIRED', 'HTTPS is required.');
    const origin = req.get('Origin');
    if (origin && !allowed.has(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.');
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && req.get('Sec-Fetch-Site') === 'cross-site' &&
      (!origin || !allowed.has(origin))) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed.');
    next();
  };
}

export function requireJson(req, _res, next) {
  const hasBody = Number(req.get('Content-Length') ?? 0) > 0 || Boolean(req.get('Transfer-Encoding'));
  if (hasBody && !req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must use application/json.');
  }
  next();
}
