import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleOptions, jsonResponse } from '@/lib/cors';
import { isWidgetOriginAllowed } from '@/lib/widget-security';
import { normalizeWidgetConfig } from '@/lib/widget-config';

export async function OPTIONS() {
  return handleOptions();
}

/**
 * GET /api/widget/[businessId]
 * Public endpoint that serves the widget configuration (colors, bot name, welcome message, etc.)
 * for embedding into client websites.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const resolvedParams = await params;
  const businessId = resolvedParams.businessId;

  if (!businessId) {
    return jsonResponse({ error: 'Missing business ID' }, 400);
  }

  const supabase = createAdminClient();

  try {
    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, name, logo_url, widget_config, website')
      .eq('id', businessId)
      .maybeSingle();

    if (error || !business) {
      return jsonResponse({ error: 'Business not found' }, 404);
    }
    const origin = req.headers.get('origin');
    if (!isWidgetOriginAllowed(origin, business.website)) {
      return jsonResponse({ error: 'This website is not authorized to use the chat widget.' }, 403);
    }

    let safeConfig;
    try { safeConfig = normalizeWidgetConfig(business.widget_config); }
    catch { return jsonResponse({ error: 'Widget configuration is invalid. Please contact the business.' }, 503); }

    return jsonResponse({
      business_id: business.id,
      business_name: business.name,
      logo_url: business.logo_url,
      config: safeConfig,
    }, 200, { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' });
  } catch (error) {
    console.error('Widget configuration request failed:', error instanceof Error ? error.name : 'unknown error');
    return jsonResponse({ error: 'Widget configuration is temporarily unavailable.' }, 500);
  }
}
