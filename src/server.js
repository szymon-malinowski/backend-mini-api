import { readConfig } from './config/env.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

let pool;
let app;
try {
  const config = readConfig();
  pool = createPool(config.databaseUrl);
  pool.on('error', () => console.error({ event: 'database_connection_failed' }));
  await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  app = await createApp({ pool, config });
  const server = app.listen(config.port, config.host, () => {
    console.log(`Mini API listening on ${config.host}:${config.port}`);
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      app.locals.close();
      await pool.end();
      clearTimeout(timeout);
    });
  };
  server.on('error', () => { console.error('HTTP server failed to start. Check HOST and PORT.'); shutdown(); process.exitCode = 1; });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (_error) {
  console.error('Startup failed. Check environment configuration, PostgreSQL connectivity, and run npm run db:migrate.');
  app?.locals.close();
  await pool?.end();
  process.exitCode = 1;
}
