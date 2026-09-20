import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('rate-limit pepper deployment configuration', () => {
  it('documents the server-only secret', () => {
    expect(read('.env.example')).toMatch(/^RATE_LIMIT_PEPPER=$/m);
    expect(read('README.md')).toContain('npx wrangler secret put RATE_LIMIT_PEPPER');
    expect(read('README.md')).toContain('openssl rand -hex 32');
  });

  it('passes the GitHub secret to Wrangler deployment', () => {
    const deployment = read('.github/workflows/deploy.yml');

    expect(deployment).toContain('RATE_LIMIT_PEPPER: ${{ secrets.RATE_LIMIT_PEPPER }}');
    expect(deployment).toMatch(/^\s+RATE_LIMIT_PEPPER\s*$/m);
  });

  it('never stores the secret as a public or Wrangler variable', () => {
    expect(read('.env.example')).not.toContain('PUBLIC_RATE_LIMIT_PEPPER');
    expect(read('wrangler.jsonc')).not.toContain('RATE_LIMIT_PEPPER');
  });
});
