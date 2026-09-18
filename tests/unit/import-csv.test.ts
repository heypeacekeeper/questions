import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllQuestions,
  importQuestionsAtomically,
  type AtomicImportQuestion,
} from '../../tools/import-csv';
import { asCsv, type ExportQuestion } from '../../tools/export-questions';
import type { TypedSupabaseClient } from '@/infrastructure/supabase/client';
import type { QuestionRow } from '@/infrastructure/supabase/database.types';

describe('CSV question importer', () => {
  it('fetches more than 3000 existing questions in pages', async () => {
    const databaseRows: QuestionRow[] = Array.from({ length: 3005 }, (_, index) => ({
      id: `question-${index}`,
      option_a: `option a ${index}`,
      option_b: `option b ${index}`,
      status: 'draft',
      share_code: `share-${index}`,
      sort_order: index,
      is_demo: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      published_at: null,
    }));

    const requestedRanges: Array<[number, number]> = [];

    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => {
              requestedRanges.push([from, to]);

              return {
                data: databaseRows.slice(from, to + 1),
                error: null,
              };
            },
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const result = await fetchAllQuestions(client);

    expect(result).toHaveLength(3005);
    expect(result[3004]?.id).toBe('question-3004');
    expect(requestedRanges).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
      [1500, 1999],
      [2000, 2499],
      [2500, 2999],
      [3000, 3499],
    ]);
  });
});

describe('atomic CSV question import', () => {
  const rows: AtomicImportQuestion[] = [
    {
      line: 2,
      option_a: 'sweat maple syrup',
      option_b: 'sneeze glitter',
      status: 'draft',
      sort_order: 1000,
      is_demo: false,
      category_ids: ['11111111-1111-4111-8111-000000000007'],
    },
    {
      line: 3,
      option_a: 'fly forever',
      option_b: 'breathe underwater',
      status: 'draft',
      sort_order: 1001,
      is_demo: false,
      category_ids: ['11111111-1111-4111-8111-000000000008'],
    },
  ];

  it('sends the complete batch through one database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const client = { rpc } as unknown as TypedSupabaseClient;

    await expect(importQuestionsAtomically(client, rows)).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('import_questions_atomic', {
      p_rows: rows,
    });
  });

  it('reports a transaction failure without client-side rollback', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'CSV line 3: category link failed' },
    });

    const client = { rpc } as unknown as TypedSupabaseClient;

    await expect(importQuestionsAtomically(client, rows)).rejects.toThrow(
      /Atomic question import failed: CSV line 3/,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('question exporter', () => {
  it('exports question data without obsolete display counts in CSV output', () => {
    const row: ExportQuestion = {
      id: 'question-1',
      option_a: 'sweat maple syrup',
      option_b: 'sneeze glitter',
      categories: 'funny',
      status: 'draft',
      share_code: 'abc2345',
      sort_order: 1000,
      is_demo: false,
      published_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      fingerprint: 'sneeze glitter || sweat maple syrup',
    };

    const csv = asCsv([row]);

    expect(csv).not.toContain('display_vote_count');
    expect(csv).toContain('question-1');
  });
});
