/** Cloudflare bindings (vars + secrets) for on-demand endpoints. Astro 6+/adapter 14: use cloudflare:workers, not locals.runtime.env. */
import { env } from 'cloudflare:workers';
import type { RawEnv } from '@/config/env';
export function workerBindings(): RawEnv { return env as unknown as RawEnv; }
