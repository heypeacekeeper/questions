#!/usr/bin/env node
/**
 * Import questions from CSV into Supabase.
 *
 * Required columns: option_a, option_b, categories
 * Optional columns: status, sort_order, is_demo
 * `categories` is a pipe-separated list of existing category slugs.
 *
 * Usage:
 *   npm run import:csv -- --file ./questions.csv --dry-run
 *   npm run import:csv -- --file ./questions.csv
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBuildClient } from '../src/infrastructure/supabase/client';
import type { CategoryRow, ContentStatus, QuestionRow } from '../src/infrastructure/supabase/database.types';
import { normalizeForComparison, questionPairFingerprint } from '../src/lib/text';

interface ImportRow {
  optionA: string;
  optionB: string;
  categorySlugs: string[];
  status: ContentStatus;
  sortOrder: number;
  isDemo: boolean;
  line: number;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Add it to .env or the command environment.`);
  return value;
}

function parseBoolean(value: string, line: number): boolean {
  if (!value) return false;
  if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
  throw new Error(`Line ${line}: is_demo must be true or false.`);
}

function parseRows(csv: string): ImportRow[] {
  const records = parseCsv(csv);
  const header = records.shift()?.map((value) => value.trim().toLowerCase());
  if (!header) throw new Error('CSV is empty.');
  for (const required of ['option_a', 'option_b', 'categories']) {
    if (!header.includes(required)) throw new Error(`Missing required CSV column: ${required}`);
  }
  const read = (cells: string[], key: string): string => cells[header.indexOf(key)]?.trim() ?? '';
  return records.map((cells, index) => {
    const line = index + 2;
    const optionA = read(cells, 'option_a');
    const optionB = read(cells, 'option_b');
    const categorySlugs = read(cells, 'categories').split('|').map((slug) => slug.trim()).filter(Boolean);
    const statusRaw = read(cells, 'status') || 'draft';
    if (optionA.length < 2 || optionA.length > 200 || optionB.length < 2 || optionB.length > 200) {
      throw new Error(`Line ${line}: options must contain 2–200 characters.`);
    }
    if (normalizeForComparison(optionA) === normalizeForComparison(optionB)) {
      throw new Error(`Line ${line}: options must be different.`);
    }
    if (categorySlugs.length === 0) throw new Error(`Line ${line}: at least one category slug is required.`);
    if (!['draft', 'published', 'archived'].includes(statusRaw)) throw new Error(`Line ${line}: invalid status "${statusRaw}".`);
    const sortOrderRaw = read(cells, 'sort_order');
    const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : 1000;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000_000) throw new Error(`Line ${line}: invalid sort_order.`);
    return { optionA, optionB, categorySlugs, status: statusRaw as ContentStatus, sortOrder, isDemo: parseBoolean(read(cells, 'is_demo'), line), line };
  });
}

async function main(): Promise<void> {
  const file = argument('--file') ?? process.argv.find((value, index) => index > 1 && !value.startsWith('--'));
  if (!file) throw new Error('Usage: npm run import:csv -- --file ./questions.csv [--dry-run]');
  const dryRun = process.argv.includes('--dry-run');
  const rows = parseRows(readFileSync(resolve(file), 'utf8'));
  const client = createBuildClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'));

  const [{ data: categories, error: categoryError }, { data: questions, error: questionError }] = await Promise.all([
    client.from('categories').select('*'),
    client.from('questions').select('*'),
  ]);
  if (categoryError) throw new Error(`Could not load categories: ${categoryError.message}`);
  if (questionError) throw new Error(`Could not load questions: ${questionError.message}`);

  const categoryBySlug = new Map((categories as CategoryRow[]).map((category) => [category.slug, category]));
  const fingerprints = new Set((questions as QuestionRow[]).map((question) => questionPairFingerprint(question.option_a, question.option_b)));
  const accepted: ImportRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const missing = row.categorySlugs.filter((slug) => !categoryBySlug.has(slug));
    if (missing.length > 0) throw new Error(`Line ${row.line}: unknown categories: ${missing.join(', ')}`);
    const fingerprint = questionPairFingerprint(row.optionA, row.optionB);
    if (fingerprints.has(fingerprint)) { console.warn(`Skip line ${row.line}: duplicate question pair.`); skipped += 1; continue; }
    fingerprints.add(fingerprint);
    accepted.push(row);
  }

  if (dryRun) {
    console.log(`Dry run complete: ${accepted.length} questions ready, ${skipped} duplicates skipped.`);
    return;
  }

  let imported = 0;
  for (const row of accepted) {
    const { data, error } = await client.from('questions').insert({
      option_a: row.optionA,
      option_b: row.optionB,
      status: row.status,
      sort_order: row.sortOrder,
      is_demo: row.isDemo,
    }).select('id').single();
    if (error) throw new Error(`Line ${row.line}: question insert failed: ${error.message}`);
    const questionId = (data as Pick<QuestionRow, 'id'>).id;
    const links = row.categorySlugs.map((slug) => ({ question_id: questionId, category_id: categoryBySlug.get(slug)!.id }));
    const { error: linkError } = await client.from('question_categories').insert(links);
    if (linkError) {
      await client.from('questions').delete().eq('id', questionId);
      throw new Error(`Line ${row.line}: category links failed and question was rolled back: ${linkError.message}`);
    }
    imported += 1;
  }
  console.log(`Import complete: ${imported} questions added, ${skipped} duplicates skipped.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
