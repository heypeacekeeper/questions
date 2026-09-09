import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const port = 8790,
  origin = `http://127.0.0.1:${port}`;
async function main() {
  const workspace = resolve(import.meta.dirname, '..'),
    cli = resolve(workspace, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    cwd = resolve(workspace, '.mock-runtime');
  if (!existsSync(cli)) throw new Error(`Local Wrangler CLI not found: ${cli}`);
  mkdirSync(cwd, { recursive: true });
  const worker: ChildProcess = spawn(
    process.execPath,
    [
      cli,
      'dev',
      '--config',
      '../dist/server/wrangler.json',
      '--env-file',
      '../.env.mock',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--local',
    ],
    {
      cwd,
      env: {
        PATH: process.env.PATH ?? '',
        Path: process.env.Path ?? '',
        SYSTEMROOT: process.env.SYSTEMROOT ?? '',
        DATA_PROVIDER: 'mock',
        ALLOW_MOCK_IN_PRODUCTION: 'true',
        ALLOW_DEMO_CONTENT: 'true',
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      },
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    },
  );
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin)).status === 200) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    if ((await fetch(origin)).status !== 200) throw new Error('Homepage did not return 200');
    if ((await fetch(`${origin}/game-data/manifest.json`, { redirect: 'manual' })).status !== 200)
      throw new Error('Manifest did not return 200');
    console.log('✔ Mock runtime smoke passed.');
  } finally {
    if (worker.pid && process.platform !== 'win32')
      try {
        process.kill(-worker.pid, 'SIGTERM');
      } catch {}
    else worker.kill();
    await Promise.race([once(worker, 'exit'), new Promise((r) => setTimeout(r, 2000))]);
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
