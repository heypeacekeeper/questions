/**
 * Supabase client factories. Three distinct trust levels:
 *
 *  - createBuildClient():  Node build process; secret key; reads all content.
 *  - createWorkerClient(): Cloudflare Worker form endpoints; secret key; writes forms.
 *
 * The secret key never reaches the client bundle: this module is only imported
 * from build-time code and `src/pages/api/*` (prerender = false).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

interface ClientOptions {
  url: string;
  key: string;
  /** Optional fetch override (Workers pass the global fetch implicitly). */
  fetch?: typeof fetch;
}

function create({ url, key, fetch: fetchImpl }: ClientOptions): TypedSupabaseClient {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: fetchImpl ? { fetch: fetchImpl } : undefined,
    db: { schema: 'public' },
  });
}

export function createBuildClient(url: string, secretKey: string): TypedSupabaseClient {
  return create({ url, key: secretKey });
}

export function createWorkerClient(url: string, secretKey: string): TypedSupabaseClient {
  return create({ url, key: secretKey, fetch: globalThis.fetch.bind(globalThis) });
}
