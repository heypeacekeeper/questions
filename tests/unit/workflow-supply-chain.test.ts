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
      const actionReferences = [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map(
        (match) => match[1],
      );

      for (const reference of actionReferences) {
        if (reference === undefined || reference.startsWith('./')) continue;
        expect(reference, `${file}: ${reference}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
      }
    }
  });

  it('enables weekly npm and GitHub Actions dependency updates', () => {
    const dependabot = read('.github/dependabot.yml');

    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot.match(/interval: weekly/g)).toHaveLength(2);
  });
});
