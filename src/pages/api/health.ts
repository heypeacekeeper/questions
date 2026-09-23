import type { APIRoute } from 'astro';
import type { DeploymentManifest } from '@/domain/site';
import { json } from '@/lib/api';
import { workerBindings } from '@/lib/worker-env';

export const prerender = false;

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

function isDeploymentManifest(value: unknown): value is DeploymentManifest {
  if (typeof value !== 'object' || value === null) return false;

  const manifest = value as Record<string, unknown>;

  return (
    typeof manifest.buildTimestamp === 'string' &&
    (typeof manifest.gitCommit === 'string' || manifest.gitCommit === null) &&
    typeof manifest.appVersion === 'string' &&
    typeof manifest.dataProvider === 'string' &&
    typeof manifest.publishedQuestionCount === 'number' &&
    typeof manifest.publishedCategoryCount === 'number' &&
    typeof manifest.contentChecksum === 'string'
  );
}

export const GET: APIRoute = async ({ request }) => {
  const bindings = workerBindings() as unknown as {
    ASSETS?: AssetFetcher;
  };

  if (!bindings.ASSETS) {
    return json(
      {
        ok: false,
        status: 'unhealthy',
      },
      503,
    );
  }

  try {
    const manifestUrl = new URL('/deployment-manifest.json', request.url);
    const response = await bindings.ASSETS.fetch(
      new Request(manifestUrl, {
        headers: {
          accept: 'application/json',
        },
      }),
    );

    if (!response.ok) {
      return json(
        {
          ok: false,
          status: 'unhealthy',
        },
        503,
      );
    }

    const manifest: unknown = await response.json();

    if (!isDeploymentManifest(manifest)) {
      return json(
        {
          ok: false,
          status: 'unhealthy',
        },
        503,
      );
    }

    return json({
      ok: true,
      status: 'healthy',
      appVersion: manifest.appVersion,
      gitCommit: manifest.gitCommit,
      buildTimestamp: manifest.buildTimestamp,
      dataProvider: manifest.dataProvider,
      publishedQuestionCount: manifest.publishedQuestionCount,
      publishedCategoryCount: manifest.publishedCategoryCount,
      contentChecksum: manifest.contentChecksum,
    });
  } catch {
    return json(
      {
        ok: false,
        status: 'unhealthy',
      },
      503,
    );
  }
};
