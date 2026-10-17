import { createClient } from '@/lib/supabase/server';
import { Business } from '@/lib/types';
import { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveWorkspaceLookup } from '@/lib/workspace-resolution';

export interface AuthContext {
  user: User;
  business: Business;
}

/**
 * Validates the current user session and fetches their associated business record.
 * Throws or returns null if not authenticated or no business found.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // 1. Try to find business owned by this user
  const { data: ownedBusiness, error: ownedError } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownedResolution = resolveWorkspaceLookup({
    ownedBusinessFound: Boolean(ownedBusiness),
    ownedLookupFailed: Boolean(ownedError),
    memberBusinessId: null,
    membershipLookupFailed: false,
  });
  if (ownedResolution.kind === 'unavailable') return null;
  if (ownedResolution.kind === 'owned') {
    return {
      user,
      business: ownedBusiness as Business,
    };
  }

  const { data: teamMembership, error: membershipError } = await supabase
    .from('team_members')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const workspaceLookup = resolveWorkspaceLookup({
    ownedBusinessFound: false,
    ownedLookupFailed: false,
    memberBusinessId: teamMembership?.business_id || null,
    membershipLookupFailed: Boolean(membershipError),
  });
  if (workspaceLookup.kind === 'unavailable') return null;

  if (workspaceLookup.kind === 'member') {
    const { data: memberBusiness } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', workspaceLookup.businessId)
      .maybeSingle();

    if (memberBusiness) {
      return {
        user,
        business: memberBusiness as Business,
      };
    }
    // A dangling membership must not silently create an unrelated workspace.
    return null;
  }

  // Provision before protected dashboard routes load. The database function
  // serializes concurrent first requests for this user.
  const initialName = user.user_metadata?.company_name || user.user_metadata?.full_name || 'My Company';
  const { data: provisioned, error: provisionError } = await createAdminClient()
    .rpc('get_or_create_business', { p_user_id: user.id, p_initial_name: String(initialName).slice(0, 120) });
  const business = Array.isArray(provisioned) ? provisioned[0] : provisioned;
  if (provisionError || !business) return null;
  return { user, business: business as Business };
}
