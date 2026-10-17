import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from '@/lib/supabase/keys';
import { getSupabaseSecretKey } from '@/lib/supabase/server-keys';

/**
 * Creates an administrative Supabase client using the Service Role Key.
 * This client bypasses Row Level Security (RLS) and is intended solely
 * for trusted server-side workflows such as background chunk embedding,
 * public widget chat interactions, and automated task processing.
 */
export function createAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseSecretKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
