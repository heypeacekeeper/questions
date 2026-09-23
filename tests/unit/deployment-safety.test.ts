import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('production deployment safety', () => {
  it('provides a health endpoint backed by deployment metadata', () => {
    const healthEndpoint = read('src/pages/api/health.ts');

    expect(healthEndpoint).toContain('deployment-manifest.json');
    expect(healthEndpoint).toContain('isDeploymentManifest');
    expect(healthEndpoint).toContain('dataProvider');
  });

  it('deploys only the current main commit after successful CI', () => {
    const deployment = read('.github/workflows/deploy.yml');

    expect(deployment).toContain("github.ref == 'refs/heads/main'");
    expect(deployment).toContain('git rev-parse origin/main');
    expect(deployment).toContain('actions/workflows/ci.yml/runs');
    expect(deployment).toContain('head_sha=$GITHUB_SHA');
    expect(deployment).toContain('No successful main CI run exists');
  });

  it('runs post-deployment verification against the deployed URL', () => {
    const deployment = read('.github/workflows/deploy.yml');

    expect(deployment).toContain('DEPLOYMENT_URL: ${{ steps.deploy.outputs.deployment-url }}');
    expect(deployment).toContain('npm run verify:deployment -- "$DEPLOYMENT_URL" "$GITHUB_SHA"');
    expect(read('package.json')).toContain('"verify:deployment"');
  });

  it('documents the production rollback procedure', () => {
    const rollback = read('docs/ROLLBACK.md');

    expect(rollback).toContain('npx wrangler deployments list');
    expect(rollback).toContain('npx wrangler rollback <VERSION_ID>');
    expect(rollback).toContain('/api/health/');
    expect(rollback).toContain('/deployment-manifest.json');
  });
});
