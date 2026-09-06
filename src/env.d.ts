/// <reference types="astro/client" />
/** Cloudflare Worker bindings: `vars` + secrets are plain strings. */
type WorkerEnv = Record<string, string | undefined> & { ASSETS?: unknown; FORM_RATE_LIMITER?: unknown };
type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<WorkerEnv>;
declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
declare module 'cloudflare:workers' { export const env: Record<string, string | undefined>; }
