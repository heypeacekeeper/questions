import { describe, expect, it } from 'vitest';
import {
  fetchAllQuestions,
  parseRows,
} from '../../tools/import-csv';
import {
  asCsv,
  type ExportQuestion,
} from '../../tools/export-questions';
import type { TypedSupabaseClient } from '@/infrastructure/supabase/client';
import type { QuestionRow } from '@/infrastructure/supabase/database.types';

describe('CSV question importer', () => {
  it('parses supplied, blank and zero display counts', () => {
    const rows = parseRows(
      [
        'option_a,option_b,categories,status,sort_order,display_vote_count,is_demo',
        'sweat maple syrup,sneeze glitter,funny,draft,1000,2450,false',
        'fly forever,breathe underwater,funny,draft,1001,,false',
        'always whisper,always shout,funny,draft,1002,0,false',
      ].join('\n'),
    );

    expect(rows[0]?.displayVoteCount).toBe(2450);
    expect(rows[1]?.displayVoteCount).toBeUndefined();
    expect(rows[2]?.displayVoteCount).toBe(0);
  });

  it.each(['-1', '1.5', 'NaN', 'Infinity', 'hello', '2e3'])(
    'rejects invalid display count %s',
    (value) => {
      expect(() =>
        parseRows(
          [
            'option_a,option_b,categories,display_vote_count',
            `sweat maple syrup,sneeze glitter,funny,${value}`,
          ].join('\n'),
        ),
      ).toThrow(/Line 2.*display_vote_count/);
    },
  );

  it('fetches more than 3000 existing questions in pages', async () => {
    const databaseRows: QuestionRow[] = Array.from(
      { length: 3005 },
      (_, index) => ({
        id: `question-${index}`,
        option_a: `option a ${index}`,
        option_b: `option b ${index}`,
        status: 'draft',
        share_code: `share-${index}`,
        sort_order: index,
        display_vote_count: 2000 + index,
        is_demo: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        published_at: null,
      }),
    );

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

describe('question exporter', () => {
  it('includes the exact display count in CSV output', () => {
    const row: ExportQuestion = {
      id: 'question-1',
      option_a: 'sweat maple syrup',
      option_b: 'sneeze glitter',
      categories: 'funny',
      status: 'draft',
      share_code: 'abc2345',
      sort_order: 1000,
      display_vote_count: 2450,
      is_demo: false,
      published_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      fingerprint: 'sneeze glitter || sweat maple syrup',
    };

    const csv = asCsv([row]);

    expect(csv).toContain('display_vote_count');
    expect(csv).toContain(',2450,');
  });
});
