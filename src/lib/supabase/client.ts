import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/keys';

/**
 * Creates a Supabase client for use in browser / client components.
 */
export function createClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabasePublicKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
