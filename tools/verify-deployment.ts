interface HealthResponse {
  ok?: boolean;
  status?: string;
  appVersion?: string;
  gitCommit?: string | null;
  buildTimestamp?: string;
  dataProvider?: string;
  publishedQuestionCount?: number;
  publishedCategoryCount?: number;
  contentChecksum?: string;
}

interface DeploymentManifest {
  gitCommit?: string | null;
  dataProvider?: string;
  publishedQuestionCount?: number;
  publishedCategoryCount?: number;
  contentChecksum?: string;
}

interface GameDataManifest {
  sets?: Record<string, { packs?: string[] }>;
}

const deploymentUrl = process.argv[2]?.trim();
const expectedCommit = process.argv[3]?.trim();

if (!deploymentUrl) {
  throw new Error('Usage: npm run verify:deployment -- <deployment-url> <expected-commit>');
}

if (!expectedCommit) {
  throw new Error('Expected Git commit SHA is required.');
}

const baseUrl = deploymentUrl.replace(/\/+$/, '');

async function fetchWithRetry(path: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          accept: 'application/json,text/html',
          'cache-control': 'no-cache',
        },
      });

      if (response.status < 500) return response;

      lastError = new Error(`${path} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }

  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${path}`);
}

function requireStatus(response: Response, expected: number, path: string): void {
  if (response.status !== expected) {
    throw new Error(`${path} returned ${response.status}; expected ${expected}`);
  }
}

async function main(): Promise<void> {
  const healthResponse = await fetchWithRetry('/api/health/');
  requireStatus(healthResponse, 200, '/api/health/');

  const health = (await healthResponse.json()) as HealthResponse;

  if (!health.ok || health.status !== 'healthy') {
    throw new Error('Health endpoint did not report a healthy deployment.');
  }

  if (health.gitCommit !== expectedCommit) {
    throw new Error(
      `Health endpoint commit mismatch: expected ${expectedCommit}, received ${String(
        health.gitCommit,
      )}`,
    );
  }

  if (health.dataProvider !== 'supabase') {
    throw new Error(
      `Production deployment used ${String(health.dataProvider)} instead of supabase.`,
    );
  }

  if (
    !health.publishedQuestionCount ||
    health.publishedQuestionCount < 1 ||
    !health.publishedCategoryCount ||
    health.publishedCategoryCount < 1
  ) {
    throw new Error('Production deployment contains no published content.');
  }

  const deploymentManifestResponse = await fetchWithRetry('/deployment-manifest.json');
  requireStatus(deploymentManifestResponse, 200, '/deployment-manifest.json');

  const deploymentManifest = (await deploymentManifestResponse.json()) as DeploymentManifest;

  if (deploymentManifest.gitCommit !== expectedCommit) {
    throw new Error('Deployment manifest commit does not match the deployed commit.');
  }

  if (deploymentManifest.dataProvider !== 'supabase') {
    throw new Error('Deployment manifest does not identify the Supabase provider.');
  }

  if (deploymentManifest.contentChecksum !== health.contentChecksum) {
    throw new Error('Health response and deployment manifest checksums differ.');
  }

  const homepageResponse = await fetchWithRetry('/');
  requireStatus(homepageResponse, 200, '/');

  const homepage = await homepageResponse.text();

  if (!homepage.includes('https://wouldyouratherquestions.org/')) {
    throw new Error('Homepage does not contain the production canonical URL.');
  }

  const contentSecurityPolicy = homepageResponse.headers.get('content-security-policy');
  const contentTypeOptions = homepageResponse.headers.get('x-content-type-options');

  if (!contentSecurityPolicy) {
    throw new Error('Homepage is missing Content-Security-Policy.');
  }

  if (contentTypeOptions !== 'nosniff') {
    throw new Error('Homepage is missing X-Content-Type-Options: nosniff.');
  }

  const gameManifestResponse = await fetchWithRetry('/game-data/manifest.json');
  requireStatus(gameManifestResponse, 200, '/game-data/manifest.json');

  const gameManifest = (await gameManifestResponse.json()) as GameDataManifest;
  const firstPack = Object.values(gameManifest.sets ?? {})
    .flatMap((set) => set.packs ?? [])
    .at(0);

  if (!firstPack) {
    throw new Error('Game-data manifest contains no question packs.');
  }

  const packResponse = await fetchWithRetry(firstPack);
  requireStatus(packResponse, 200, firstPack);

  const contactGetResponse = await fetchWithRetry('/api/contact/');

  if (contactGetResponse.status < 400 || contactGetResponse.status >= 500) {
    throw new Error(
      `GET /api/contact/ returned ${contactGetResponse.status}; expected a safe 4xx rejection.`,
    );
  }

  console.log(`✔ Verified production deployment ${expectedCommit}`);
  console.log(`✔ URL: ${baseUrl}`);
  console.log(
    `✔ Content: ${health.publishedQuestionCount} questions, ${health.publishedCategoryCount} categories`,
  );
  console.log(`✔ Game pack: ${firstPack}`);
}

void main().catch((error) => {
  console.error('✖ Production deployment verification failed.');
  console.error(error);
  process.exitCode = 1;
});
