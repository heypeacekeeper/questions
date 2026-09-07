/** Exercise the built Worker with only tracked mock configuration. */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const port = 8790;
const origin = `http://127.0.0.1:${port}`;
const mockVars = [
  'DATA_PROVIDER:mock',
  'ALLOW_MOCK_IN_PRODUCTION:true',
  'ALLOW_DEMO_CONTENT:true',
  'PUBLIC_TURNSTILE_SITE_KEY:1x00000000000000000000AA',
  'TURNSTILE_SECRET_KEY:1x0000000000000000000000000000000AA',
  'VOTER_HASH_SECRET:mock-runtime-voter-secret-at-least-32-characters',
];

function startWorker(): ChildProcess {
  const workspace = resolve(import.meta.dirname, '..');
  const wranglerCli = resolve(workspace, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(wranglerCli)) throw new Error(`Local Wrangler CLI not found: ${wranglerCli}. Run npm install before npm run test:runtime:mock.`);
  const runtimeDirectory = resolve(workspace, '.mock-runtime');
  mkdirSync(runtimeDirectory, { recursive: true });
  const environment = {
    PATH: process.env.PATH ?? '', Path: process.env.Path ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '',
    SystemRoot: process.env.SystemRoot ?? '', COMSPEC: process.env.COMSPEC ?? '', PATHEXT: process.env.PATHEXT ?? '',
    TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '', HOME: process.env.HOME ?? '', USERPROFILE: process.env.USERPROFILE ?? '',
    DATA_PROVIDER: 'mock', ALLOW_MOCK_IN_PRODUCTION: 'true', ALLOW_DEMO_CONTENT: 'true',
    PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    VOTER_HASH_SECRET: 'mock-runtime-voter-secret-at-least-32-characters',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  };
  return spawn(process.execPath, [
    wranglerCli, 'dev', '--config', '../dist/server/wrangler.json', '--env-file', '../.env.mock',
    '--ip', '127.0.0.1', '--port', String(port), '--local', '--log-level', 'warn',
    ...mockVars.flatMap((value) => ['--var', value]),
  ], { cwd: runtimeDirectory, env: environment, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' });
}

async function stopWorker(worker: ChildProcess): Promise<void> {
  if (process.platform === 'win32') {
    if (worker.pid) spawn('taskkill', ['/pid', String(worker.pid), '/t', '/f'], { stdio: 'ignore', shell: false });
  } else if (worker.pid) {
    try { process.kill(-worker.pid, 'SIGTERM'); } catch { worker.kill('SIGTERM'); }
  } else {
    worker.kill('SIGTERM');
  }
  await Promise.race([once(worker, 'exit'), new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

async function waitForWorker(worker: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Mock Worker exited with code ${worker.exitCode}`);
    try {
      if ((await fetch(`${origin}/`, { redirect: 'manual' })).status === 200) return;
    } catch { /* Worker is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Mock Worker did not start within 30 seconds');
}

async function requestVote(questionId: string, choice: 'A' | 'B', cookie: string): Promise<{ result: { votesA: number; votesB: number; total: number }; cookie: string }> {
  const response = await fetch(`${origin}/api/vote/`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin, 'content-type': 'application/json', accept: 'application/json', cookie },
    body: JSON.stringify({ questionId, choice }),
  });
  if (response.status !== 200) throw new Error(`Vote ${choice} returned ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { ok?: boolean; result?: { votesA: number; votesB: number; total: number } };
  if (!payload.ok || !payload.result) throw new Error('Vote response was missing its successful result');
  return { result: payload.result, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie };
}

async function main(): Promise<void> {
  const worker = startWorker();
  let logs = '';
  worker.stdout?.on('data', (data: Buffer) => { logs += data.toString(); });
  worker.stderr?.on('data', (data: Buffer) => { logs += data.toString(); });
  try {
    await waitForWorker(worker);
    const home = await fetch(`${origin}/`, { redirect: 'manual' });
    if (home.status !== 200) throw new Error(`Homepage returned ${home.status}`);
    const html = await home.text();
    const questionId = /data-question-id="([0-9a-f-]{36})"/i.exec(html)?.[1];
    if (!questionId) throw new Error('Homepage did not render an initial question id');

    const manifest = await fetch(`${origin}/game-data/manifest.json`, { redirect: 'manual' });
    if (manifest.status !== 200) throw new Error(`Game-data manifest returned ${manifest.status}`);

    const first = await requestVote(questionId, 'A', '');
    const second = await requestVote(questionId, 'A', first.cookie);
    const third = await requestVote(questionId, 'B', second.cookie);
    if (first.result.votesA !== 1 || first.result.votesB !== 0 || first.result.total !== 1) throw new Error('First A vote did not produce 1/0/1');
    if (second.result.votesA !== 2 || second.result.votesB !== 0 || second.result.total !== 2) throw new Error('Second A vote did not increment aggregate totals');
    if (third.result.votesA !== 2 || third.result.votesB !== 1 || third.result.total !== 3) throw new Error('B vote did not increment its aggregate total');
    console.log('✔ Mock Worker runtime smoke passed: homepage, manifest, and repeat votes returned expected results.');
  } finally {
    await stopWorker(worker);
    if (worker.exitCode !== null && worker.exitCode !== 0 && !worker.killed) console.error(logs);
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
