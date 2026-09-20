import { isIP } from 'node:net';

function positiveInteger(value, fallback, name, max = 2147483647) {
  const text = String(value ?? fallback);
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`);
  }
  return number;
}

function origin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
    throw new Error('Origins must be exact HTTP(S) origins without a trailing slash.');
  }
  return value;
}

export function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV.');
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-')) {
    throw new Error('SESSION_SECRET must contain at least 32 random characters.');
  }
  const appOrigin = origin(env.APP_ORIGIN ?? 'http://localhost:3000');
  const corsOrigins = (env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean).map(origin);
  const production = nodeEnv === 'production';
  if (production && [appOrigin, ...corsOrigins].some(s => !s.startsWith('https://'))) {
    throw new Error('Production origins must use HTTPS.');
  }
  const trustProxy = (env.TRUST_PROXY ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const address of trustProxy) {
    const [ip, bits, extra] = address.split('/');
    const version = isIP(ip);
    if (!version || extra !== undefined || (bits !== undefined &&
      (!/^\d+$/.test(bits) || Number(bits) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY must contain explicit proxy IP addresses or CIDRs.');
    }
  }
  return {
    nodeEnv, production, databaseUrl, appOrigin, corsOrigins, trustProxy,
    sessionSecret: env.SESSION_SECRET,
    host: env.HOST ?? '127.0.0.1',
    port: positiveInteger(env.PORT, 3000, 'PORT', 65535),
    globalRateLimit: positiveInteger(env.GLOBAL_RATE_LIMIT, 100, 'GLOBAL_RATE_LIMIT'),
    authRateLimit: positiveInteger(env.AUTH_RATE_LIMIT, 10, 'AUTH_RATE_LIMIT'),
  };
}
