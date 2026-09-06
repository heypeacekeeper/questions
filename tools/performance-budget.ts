/** Reports gzip sizes of build output and fails on major budget violations. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const DIST = require('node:fs').existsSync('dist/client') ? 'dist/client' : 'dist';
const BUDGET_KB = { js: 35, css: 25, homeHtml: 100, categoryHtml: 150, pack: 25 };
function walk(dir: string): string[] { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const gz = (p: string) => gzipSync(readFileSync(p)).length / 1024;
const files = walk(DIST).filter((f) => !f.includes('_worker.js'));
const sum = (pred: (f: string) => boolean) => files.filter(pred).reduce((n, f) => n + gz(f), 0);
const rows: [string, number, number][] = [];
rows.push(['Initial JS (all _astro/*.js)', sum((f) => f.includes('/_astro/') && f.endsWith('.js')), BUDGET_KB.js]);
rows.push(['Initial CSS (all _astro/*.css)', sum((f) => f.includes('/_astro/') && f.endsWith('.css')), BUDGET_KB.css]);
const home = join(DIST, 'index.html'); rows.push(['Homepage HTML', gz(home), BUDGET_KB.homeHtml]);
const cats = files.filter((f) => f.endsWith('index.html') && f.includes('would-you-rather') && !f.includes('/page/'));
rows.push(['Largest category HTML', Math.max(0, ...cats.map(gz)), BUDGET_KB.categoryHtml]);
const packs = files.filter((f) => f.includes('/game-data/') && f.includes('pack-'));
rows.push(['Largest game-data pack', Math.max(0, ...packs.map(gz)), BUDGET_KB.pack]);
let failed = false;
for (const [name, kb, budget] of rows) { const over = kb > budget; if (over) failed = true; console.log(`${over ? '✖' : '✔'} ${name.padEnd(34)} ${kb.toFixed(1).padStart(7)} KB gz  (budget ${budget} KB)`); }
const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/.test(f)); console.log(`${fonts.length ? '✖' : '✔'} External/self-hosted font files: ${fonts.length}`);
if (failed) { console.error('\n✖ Performance budget exceeded.'); process.exit(1); }
console.log('\n✔ All performance budgets met.');
