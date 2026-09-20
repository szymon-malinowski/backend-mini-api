import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createPool } from '../src/db/pool.js';
import { availablePort, initializeCluster, localRoot, postgresBin, startCluster, stopCluster } from './postgres.js';

const bin = await postgresBin();
const directory = join(localRoot, `test-${randomUUID()}`);
const port = await availablePort();
const password = randomBytes(32).toString('hex');
let started = false;
try {
  await initializeCluster(bin, directory, password);
  startCluster(bin, directory, port);
  started = true;
  const admin = createPool(`postgresql://mini_admin:${password}@127.0.0.1:${port}/postgres`);
  try { await admin.query('CREATE DATABASE mini_api_test'); } finally { await admin.end(); }
  console.log('Running integration tests against isolated PostgreSQL.');
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/integration/api.test.js'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test',
      TEST_DATABASE_URL: `postgresql://mini_admin:${password}@127.0.0.1:${port}/mini_api_test` },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
} finally {
  if (started) stopCluster(bin, directory);
  // directory is always generated beneath this workspace's .local directory.
  await rm(directory, { recursive: true, force: true });
}
