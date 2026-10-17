import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleOptions, jsonResponse } from '@/lib/cors';
import { isWidgetOriginAllowed } from '@/lib/widget-security';
import { canRequestHumanFollowUp } from '@/lib/conversation-status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return handleOptions();
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  try {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 2000) return jsonResponse({ error: 'Request is too large.' }, 413);
    const body = await req.json();
    if (!UUID_RE.test(body.business_id || '') || !UUID_RE.test(body.conversation_id || '') ||
        typeof body.visitor_id !== 'string' || body.visitor_id.length < 1 || body.visitor_id.length > 128) {
      return jsonResponse({ error: 'A valid conversation is required before requesting follow-up.' }, 400);
    }
    const supabase = createAdminClient();
    const { data: business } = await supabase.from('businesses').select('id, website').eq('id', body.business_id).maybeSingle();
    if (!business || !isWidgetOriginAllowed(origin, business.website)) {
      return jsonResponse({ error: 'This website is not authorized to use the chat widget.' }, 403);
    }
    const { data: conversation } = await supabase.from('conversations').select('id, status')
      .eq('id', body.conversation_id).eq('business_id', body.business_id).eq('visitor_id', body.visitor_id).maybeSingle();
    if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
    if (!canRequestHumanFollowUp(conversation.status)) {
      return jsonResponse({ error: 'This conversation is closed. Start a new conversation to request help.' }, 409,
        origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
    }
    if (conversation.status === 'active') {
      const { data: updated, error } = await supabase.from('conversations').update({ status: 'escalated', updated_at: new Date().toISOString() })
        .eq('id', conversation.id).eq('business_id', business.id).eq('status', 'active').select('id').maybeSingle();
      if (error) return jsonResponse({ error: 'Could not request business follow-up.' }, 503);
      if (!updated) {
        const { data: latest } = await supabase.from('conversations').select('status')
          .eq('id', conversation.id).eq('business_id', business.id).maybeSingle();
        if (latest?.status !== 'escalated') return jsonResponse({ error: 'This conversation is no longer active.' }, 409,
          origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
      }
    }
    const { error: noteError } = await supabase.from('messages').insert({ conversation_id: conversation.id, role: 'system', content: 'Visitor requested human follow-up.', metadata: { event: 'visitor_escalation' } });
    if (noteError && noteError.code !== '23505') return jsonResponse({ error: 'The conversation was escalated, but its request note could not be saved. Please retry.' }, 503);
    return jsonResponse({ status: 'escalated', message: 'Your request is recorded for the business to review in AgentDesk.' }, 200,
      origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
  } catch {
    return jsonResponse({ error: 'Could not request business follow-up.' }, 400,
      origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
  }
}
