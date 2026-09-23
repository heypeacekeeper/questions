import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('workflow supply-chain security', () => {
  it('pins external GitHub Actions to full commit SHAs', () => {
    const workflowDirectory = new URL('.github/workflows/', root);
    const workflowFiles = readdirSync(workflowDirectory).filter(
      (file) => file.endsWith('.yml') || file.endsWith('.yaml'),
    );

    expect(workflowFiles.length).toBeGreaterThan(0);

    for (const file of workflowFiles) {
      const source = read(`.github/workflows/${file}`);
      const actionReferences = Array.from(
        source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm),
        (match) => match[1],
      ).filter((reference): reference is string => reference !== undefined);

      for (const reference of actionReferences) {
        if (reference.startsWith('./')) continue;
        expect(reference, `${file}: ${reference}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
      }
    }
  });
});
