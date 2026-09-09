/** Reports gzip sizes of build output and fails on major budget violations. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { normalizePath } from '../src/lib/performance-path';

const DIST = existsSync('dist/client') ? 'dist/client' : 'dist';
const BUDGET_KB = { js: 35, css: 25, homeHtml: 100, categoryHtml: 150, pack: 25 };
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((file) => {
    const path = join(dir, file);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const gz = (path: string) => gzipSync(readFileSync(path)).length / 1024;
const files = walk(DIST).filter((file) => !normalizePath(file).includes('_worker.js'));
const sum = (predicate: (file: string) => boolean) =>
  files.filter(predicate).reduce((total, file) => total + gz(file), 0);
const pathIs = (file: string, fragment: string) => normalizePath(file).includes(fragment);
const rows: [string, number, number][] = [];
rows.push([
  'Total emitted client JS (all _astro/*.js)',
  sum((file) => pathIs(file, '/_astro/') && normalizePath(file).endsWith('.js')),
  BUDGET_KB.js,
]);
rows.push([
  'Total emitted CSS (all _astro/*.css)',
  sum((file) => pathIs(file, '/_astro/') && normalizePath(file).endsWith('.css')),
  BUDGET_KB.css,
]);
rows.push(['Homepage HTML', gz(join(DIST, 'index.html')), BUDGET_KB.homeHtml]);
const categories = files.filter(
  (file) =>
    normalizePath(file).endsWith('index.html') &&
    pathIs(file, 'would-you-rather') &&
    !pathIs(file, '/page/'),
);
rows.push(['Largest category HTML', Math.max(0, ...categories.map(gz)), BUDGET_KB.categoryHtml]);
const packs = files.filter((file) => pathIs(file, '/game-data/') && pathIs(file, 'pack-'));
rows.push(['Largest game-data pack', Math.max(0, ...packs.map(gz)), BUDGET_KB.pack]);
let failed = false;
for (const [name, size, budget] of rows) {
  const over = size > budget;
  if (over) failed = true;
  console.log(
    `${over ? '✖' : '✔'} ${name.padEnd(42)} ${size.toFixed(1).padStart(7)} KB gz  (budget ${budget} KB)`,
  );
}
const fonts = files.filter((file) => /\.(woff2?|ttf|otf)$/.test(normalizePath(file)));
console.log(`${fonts.length ? '✖' : '✔'} External/self-hosted font files: ${fonts.length}`);
if (failed) {
  console.error('\n✖ Performance budget exceeded.');
  process.exit(1);
}
console.log('\n✔ All performance budgets met.');
