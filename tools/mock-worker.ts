/** Start the built Worker with an isolated, tracked mock-only runtime environment. */
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const workspace = resolve(import.meta.dirname, '..');
const runtimeDirectory = resolve(workspace, '.mock-runtime');
const port = process.env.MOCK_PORT ?? '8787';
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const safeEnvironment = {
  PATH: process.env.PATH ?? '',
  Path: process.env.Path ?? '',
  SYSTEMROOT: process.env.SYSTEMROOT ?? '',
  SystemRoot: process.env.SystemRoot ?? '',
  COMSPEC: process.env.COMSPEC ?? '',
  PATHEXT: process.env.PATHEXT ?? '',
  TEMP: process.env.TEMP ?? '',
  TMP: process.env.TMP ?? '',
  HOME: process.env.HOME ?? '',
  USERPROFILE: process.env.USERPROFILE ?? '',
  DATA_PROVIDER: 'mock',
  ALLOW_MOCK_IN_PRODUCTION: 'true',
  ALLOW_DEMO_CONTENT: 'true',
  PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  VOTER_HASH_SECRET: 'mock-runtime-voter-secret-at-least-32-characters',
};

mkdirSync(runtimeDirectory, { recursive: true });
const worker = spawn(command, [
  '--prefix', '..', 'wrangler', 'dev', '--config', '../dist/server/wrangler.json', '--env-file', '../.env.mock',
  '--ip', '127.0.0.1', '--port', port, '--local',
  '--var', 'DATA_PROVIDER:mock',
  '--var', 'ALLOW_MOCK_IN_PRODUCTION:true',
  '--var', 'ALLOW_DEMO_CONTENT:true',
  '--var', 'PUBLIC_TURNSTILE_SITE_KEY:1x00000000000000000000AA',
  '--var', 'TURNSTILE_SECRET_KEY:1x0000000000000000000000000000000AA',
  '--var', 'VOTER_HASH_SECRET:mock-runtime-voter-secret-at-least-32-characters',
], { cwd: runtimeDirectory, env: safeEnvironment, stdio: 'inherit', shell: false });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => worker.kill(signal));
}
worker.on('exit', (code) => { process.exitCode = code ?? 1; });
