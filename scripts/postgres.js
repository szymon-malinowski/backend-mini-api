import { existsSync } from 'node:fs';
import { mkdir, writeFile, unlink, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

export const localRoot = resolve('.local');
export async function postgresBin() {
  if (process.env.PG_BIN) return resolve(process.env.PG_BIN);
  if (process.platform === 'win32') {
    const base = 'C:/Program Files/PostgreSQL';
    const versions = await readdir(base).catch(() => []);
    for (const version of versions.sort((a, b) => Number(b) - Number(a))) {
      const bin = join(base, version, 'bin');
      if (existsSync(join(bin, 'initdb.exe'))) return bin;
    }
  }
  return ''; // Unix: use PostgreSQL tools on PATH.
}

export function pgCommand(bin, command, args, quiet = true) {
  const executable = bin ? join(bin, command + (process.platform === 'win32' ? '.exe' : '')) : command;
  // On Windows the detached server can inherit pipe handles from pg_ctl.
  // Ignoring its stdio prevents spawnSync from waiting for the server to exit.
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true,
    ...(command === 'pg_ctl' ? { stdio: 'ignore' } : {}) });
  if (result.error || result.status !== 0) {
    // Command arguments never contain passwords. initdb receives a temporary password file.
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status}; see postgres.log`}`);
  }
  if (!quiet && result.stdout) console.log(result.stdout.trim());
}

export async function initializeCluster(bin, directory, password) {
  await mkdir(directory, { recursive: true });
  const data = join(directory, 'data');
  if (existsSync(join(data, 'PG_VERSION'))) return data;
  const passwordFile = join(directory, 'init-password');
  try {
    await writeFile(passwordFile, password, { mode: 0o600 });
    pgCommand(bin, 'initdb', ['-D', data, '-U', 'mini_admin', '--pwfile', passwordFile,
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C']);
  } finally {
    await unlink(passwordFile).catch(() => {});
  }
  return data;
}

export function startCluster(bin, directory, port) {
  pgCommand(bin, 'pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
}

export function stopCluster(bin, directory) {
  pgCommand(bin, 'pg_ctl', ['-D', join(directory, 'data'), '-m', 'fast', '-w', 'stop']);
}

export async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
