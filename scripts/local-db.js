import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPool } from '../src/db/pool.js';
import { initializeCluster, localRoot, postgresBin, startCluster, stopCluster } from './postgres.js';

const action = process.argv[2];
if (!['start', 'stop'].includes(action)) throw new Error('Usage: node scripts/local-db.js start|stop');
const directory = join(localRoot, 'development');
const bin = await postgresBin();
if (action === 'stop') {
  stopCluster(bin, directory);
  console.log('Local development PostgreSQL stopped.');
} else {
  await mkdir(directory, { recursive: true });
  const settingsPath = join(directory, 'settings.json');
  let settings;
  if (existsSync(settingsPath)) settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  else {
    settings = { port: 55432, adminPassword: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex') };
    await writeFile(settingsPath, JSON.stringify(settings), { mode: 0o600 });
  }
  const data = await initializeCluster(bin, directory, settings.adminPassword);
  if (!existsSync(join(data, 'postmaster.pid'))) startCluster(bin, directory, settings.port);
  const admin = createPool(`postgresql://mini_admin:${settings.adminPassword}@127.0.0.1:${settings.port}/postgres`);
  try {
    if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'mini_api'")).rowCount) {
      // appPassword is generated internally as hexadecimal, never arbitrary SQL input.
      if (!/^[a-f0-9]{64}$/.test(settings.appPassword)) throw new Error('Invalid local database settings.');
      await admin.query(`CREATE ROLE mini_api LOGIN PASSWORD '${settings.appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    }
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'mini_api'")).rowCount) {
      await admin.query('CREATE DATABASE mini_api OWNER mini_api');
    }
  } finally { await admin.end(); }
  const generated = [
    'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3000',
    `DATABASE_URL=postgresql://mini_api:${settings.appPassword}@127.0.0.1:${settings.port}/mini_api`,
    `SESSION_SECRET=${randomBytes(48).toString('hex')}`, 'APP_ORIGIN=http://localhost:3000', '',
  ].join('\n');
  const output = existsSync('.env') ? join(directory, 'generated.env') : '.env';
  await writeFile(output, generated, { mode: 0o600 });
  console.log(`Local PostgreSQL is running on 127.0.0.1:${settings.port}. Configuration saved to ${output}.`);
  if (output !== '.env') console.log('Existing .env preserved. Use the generated settings if you want this local instance.');
}
