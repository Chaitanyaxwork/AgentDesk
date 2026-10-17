import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Business } from '@/lib/types';
import { validatePublicDestination } from '@/lib/safe-fetch';
import { isSameOriginWrite } from '@/lib/request-security';
import { resolveWorkspaceLookup } from '@/lib/workspace-resolution';

/**
 * GET /api/business
 * Returns the business profile for the currently authenticated user.
 * Automatically provisions an initial business record if one does not yet exist.
 */
export async function GET() {
  const supabaseServer = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Try fetching owned business
  const { data: business, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownedResolution = resolveWorkspaceLookup({
    ownedBusinessFound: Boolean(business),
    ownedLookupFailed: Boolean(error),
    memberBusinessId: null,
    membershipLookupFailed: false,
  });
  if (ownedResolution.kind === 'unavailable') {
    return NextResponse.json({ error: 'Could not resolve your workspace. Please try again.' }, { status: 503 });
  }

  if (ownedResolution.kind === 'owned') {
    return NextResponse.json(business as Business);
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

  if (workspaceLookup.kind === 'unavailable') {
    return NextResponse.json({ error: 'Could not resolve your workspace. Please try again.' }, { status: 503 });
  }

  if (workspaceLookup.kind === 'member') {
    const { data: memberBusiness } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', workspaceLookup.businessId)
      .maybeSingle();

    if (memberBusiness) {
      return NextResponse.json(memberBusiness as Business);
    }
    return NextResponse.json({ error: 'Could not resolve your workspace. Please try again.' }, { status: 503 });
  }

  // Atomic, idempotent provisioning also covers APIs that arrive before the
  // dashboard shell has made its first business request.
  const initialName = user.user_metadata?.company_name || user.user_metadata?.full_name || 'My Company';
  const { data: provisioned, error: createError } = await supabase.rpc('get_or_create_business', {
    p_user_id: user.id,
    p_initial_name: String(initialName).slice(0, 120),
  });
  const newBusiness = Array.isArray(provisioned) ? provisioned[0] : provisioned;

  if (createError || !newBusiness) {
    console.error('Failed to create default business:', createError?.code || 'database error');
    return NextResponse.json({ error: 'Failed to initialize business account' }, { status: 500 });
  }

  return NextResponse.json(newBusiness as Business);
}

/**
 * PUT /api/business
 * Updates business name, website, and logo URL.
 */
export async function PUT(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authCtx.business.user_id !== authCtx.user.id) return NextResponse.json({ error: 'Only the workspace owner can change business settings.' }, { status: 403 });

  try {
    const body = await req.json();
    const { name, website, logo_url } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }

    if (typeof website === 'string') {
      if (website.trim()) {
        if (website.length > 2048) return NextResponse.json({ error: 'Website URL is too long.' }, { status: 400 });
        const safeWebsite = await validatePublicDestination(website.trim());
        updates.website = safeWebsite.toString();
      } else updates.website = '';
    }

    if (logo_url !== undefined) {
      updates.logo_url = logo_url ? String(logo_url).trim() : null;
    }

    const supabase = createAdminClient();
    const { data: updatedBusiness, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', authCtx.business.id)
      .select('*')
      .single();

    if (error || !updatedBusiness) {
      console.error('Error updating business:', error);
      return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 });
    }

    return NextResponse.json(updatedBusiness as Business);
  } catch (error) {
    console.error('Error in business PUT:', error);
    return NextResponse.json(
      { error: 'Could not update business settings.' },
      { status: 500 }
    );
  }
}
