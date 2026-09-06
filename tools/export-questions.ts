#!/usr/bin/env node
/**
 * Export all Supabase questions with category slugs as JSON or CSV.
 *
 * Usage:
 *   npm run export:json -- --out ./questions.json
 *   npm run export:csv -- --out ./questions.csv
 * Omit --out to print to stdout.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBuildClient } from '../src/infrastructure/supabase/client';
import type { CategoryRow, QuestionCategoryRow, QuestionRow } from '../src/infrastructure/supabase/database.types';
import { questionPairFingerprint } from '../src/lib/text';

interface ExportQuestion {
  id: string;
  option_a: string;
  option_b: string;
  categories: string;
  status: string;
  share_code: string;
  sort_order: number;
  is_demo: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  fingerprint: string;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredEnv(name: 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Add it to .env or the command environment.`);
  return value;
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function asCsv(rows: ExportQuestion[]): string {
  const columns: (keyof ExportQuestion)[] = ['id', 'option_a', 'option_b', 'categories', 'status', 'share_code', 'sort_order', 'is_demo', 'published_at', 'created_at', 'updated_at', 'fingerprint'];
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

async function main(): Promise<void> {
  const format = argument('--format') ?? 'json';
  if (format !== 'json' && format !== 'csv') throw new Error('--format must be json or csv.');
  const client = createBuildClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'));
  const [questionResult, categoryResult, linkResult] = await Promise.all([
    client.from('questions').select('*').order('sort_order').order('created_at'),
    client.from('categories').select('*'),
    client.from('question_categories').select('*'),
  ]);
  for (const [label, error] of [
    ['questions', questionResult.error],
    ['categories', categoryResult.error],
    ['question-category links', linkResult.error],
  ] as const) if (error) throw new Error(`Could not export ${label}: ${error.message}`);

  const categories = categoryResult.data as CategoryRow[];
  const links = linkResult.data as QuestionCategoryRow[];
  const slugById = new Map(categories.map((category) => [category.id, category.slug]));
  const categoryIdsByQuestion = new Map<string, string[]>();
  for (const link of links) {
    const values = categoryIdsByQuestion.get(link.question_id) ?? [];
    values.push(link.category_id);
    categoryIdsByQuestion.set(link.question_id, values);
  }

  const rows: ExportQuestion[] = (questionResult.data as QuestionRow[]).map((question) => ({
    id: question.id,
    option_a: question.option_a,
    option_b: question.option_b,
    categories: (categoryIdsByQuestion.get(question.id) ?? []).map((id) => slugById.get(id) ?? id).sort().join('|'),
    status: question.status,
    share_code: question.share_code,
    sort_order: question.sort_order,
    is_demo: question.is_demo,
    published_at: question.published_at,
    created_at: question.created_at,
    updated_at: question.updated_at,
    fingerprint: questionPairFingerprint(question.option_a, question.option_b),
  }));
  const output = format === 'csv' ? asCsv(rows) : `${JSON.stringify(rows, null, 2)}\n`;
  const destination = argument('--out');
  if (destination) {
    const path = resolve(destination);
    writeFileSync(path, output, 'utf8');
    console.error(`Exported ${rows.length} questions to ${path}`);
  } else process.stdout.write(output);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
