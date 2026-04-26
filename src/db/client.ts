import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazy Supabase client. Returns null when env vars are missing so dry-run
 * paths and tests can import this module without crashing.
 */

function build(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabase: SupabaseClient | null = build();

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for this operation',
    );
  }
  return supabase;
}
