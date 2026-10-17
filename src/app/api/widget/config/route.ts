import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameOriginWrite } from '@/lib/request-security';
import { DEFAULT_WIDGET_CONFIG, normalizeWidgetConfig } from '@/lib/widget-config';

/**
 * PUT /api/widget/config
 * Updates the customizable widget styling and behavioral configuration for the authenticated business.
 */
export async function PUT(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    let safeCurrent = DEFAULT_WIDGET_CONFIG;
    try { safeCurrent = normalizeWidgetConfig(authCtx.business.widget_config || DEFAULT_WIDGET_CONFIG); } catch { /* Heal old unsafe rows on the next owner save. */ }
    const newConfig = normalizeWidgetConfig(body, safeCurrent);

    const supabase = createAdminClient();
    const { data: updatedBusiness, error } = await supabase
      .from('businesses')
      .update({
        widget_config: newConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authCtx.business.id)
      .select('*')
      .single();

    if (error || !updatedBusiness) {
      console.error('Error updating widget config:', error);
      return NextResponse.json({ error: 'Failed to update widget config' }, { status: 500 });
    }

    return NextResponse.json({
      widget_config: normalizeWidgetConfig(updatedBusiness.widget_config),
    });
  } catch (error) {
    console.error('Error in widget config PUT:', error);
    return NextResponse.json(
      { error: error instanceof Error && /must |invalid|configuration/.test(error.message) ? error.message : 'Could not update widget configuration.' },
      { status: error instanceof Error && /must |invalid|configuration/.test(error.message) ? 400 : 500 }
    );
  }
}
