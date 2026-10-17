import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAnswerWithSources } from '@/lib/rag';
import { ChatRequestBody, Message } from '@/lib/types';
import { handleOptions, jsonResponse } from '@/lib/cors';
import { AiQuotaError, AiUnavailableError, aiModels, assertAiAvailable, createAiRequestContext } from '@/lib/ai-policy';
import { isWidgetOriginAllowed } from '@/lib/widget-security';
import { isSameClientMessage } from '@/lib/chat-idempotency';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 12_000;

export async function OPTIONS() {
  return handleOptions();
}

async function readJson(req: NextRequest): Promise<ChatRequestBody> {
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('Request body is too large.');
  if (!req.body) throw new Error('A request body is required.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('Request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as ChatRequestBody;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  let activeConversationId: string | null = null;
  let activeMessageId: string | null = null;
  try {
    const body = await readJson(req);
    const { business_id, conversation_id, client_message_id, visitor_id, message, visitor_name, visitor_email, visitor_location } = body;
    const maxChars = aiModels().maxMessageChars;
    if (!UUID_RE.test(business_id || '') || !visitor_id || typeof visitor_id !== 'string' || visitor_id.length > 128) {
      return jsonResponse({ error: 'Invalid chat request.' }, 400);
    }
    if (conversation_id && !UUID_RE.test(conversation_id)) {
      return jsonResponse({ error: 'Invalid conversation.' }, 400);
    }
    if (!UUID_RE.test(client_message_id || '')) return jsonResponse({ error: 'A valid message identifier is required.' }, 400);
    if (typeof message !== 'string' || !message.trim() || message.length > maxChars) {
      return jsonResponse({ error: `Messages must be between 1 and ${maxChars} characters.` }, 400);
    }

    const supabase = createAdminClient();
    const { data: business, error: businessError } = await supabase
      .from('businesses').select('id, name, website').eq('id', business_id).maybeSingle();
    if (businessError || !business) return jsonResponse({ error: 'Business not found.' }, 404);
    if (!isWidgetOriginAllowed(origin, business.website)) {
      return jsonResponse({ error: 'This website is not authorized to use the chat widget.' }, 403);
    }

    const aiContext = createAiRequestContext(req, business.id);
    assertAiAvailable(aiContext);
    const trimmedMessage = message.trim();
    let conversationId = conversation_id;

    if (conversationId) {
      const { data: existing } = await supabase.from('conversations')
        .select('id, visitor_id, status').eq('id', conversationId).eq('business_id', business_id).maybeSingle();
      if (existing && existing.visitor_id !== visitor_id) return jsonResponse({ error: 'Conversation not found.' }, 404);
      if (existing && existing.status !== 'active') {
        return jsonResponse({ conversation_id: conversationId, error: 'This conversation has been handed to the business or closed.', retryable: false }, 409);
      }
      if (!existing) {
        const { error } = await supabase.from('conversations').insert({
          id: conversationId, business_id, visitor_id,
          visitor_name: typeof visitor_name === 'string' ? visitor_name.slice(0, 100) : null,
          visitor_email: typeof visitor_email === 'string' ? visitor_email.slice(0, 254) : null,
          visitor_location: typeof visitor_location === 'string' ? visitor_location.slice(0, 100) : null,
          status: 'active',
        });
        if (error && error.code !== '23505') return jsonResponse({ conversation_id: conversationId, error: 'Could not start this conversation.', retryable: true }, 500);
        const { data: recovered } = await supabase.from('conversations').select('id, visitor_id, status').eq('id', conversationId).eq('business_id', business_id).maybeSingle();
        if (!recovered || recovered.visitor_id !== visitor_id) return jsonResponse({ error: 'Conversation not found.' }, 404);
      }
      activeConversationId = conversationId;
    } else {
      const { data: created, error } = await supabase.from('conversations').insert({
        business_id,
        visitor_id,
        visitor_name: typeof visitor_name === 'string' ? visitor_name.slice(0, 100) : null,
        visitor_email: typeof visitor_email === 'string' ? visitor_email.slice(0, 254) : null,
        visitor_location: typeof visitor_location === 'string' ? visitor_location.slice(0, 100) : null,
        status: 'active',
      }).select('id').single();
      if (error || !created) return jsonResponse({ error: 'Could not start this conversation.' }, 500);
      conversationId = created.id;
      activeConversationId = created.id;
    }

    const { error: userMessageError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: trimmedMessage,
      metadata: { client_message_id },
    });
    if (userMessageError && userMessageError.code !== '23505') return jsonResponse({ conversation_id: conversationId, error: 'Could not save your message.', retryable: true }, 500);
    activeMessageId = client_message_id;

    if (userMessageError?.code === '23505') {
      const { data: previousUserMessage } = await supabase.from('messages').select('content')
        .eq('conversation_id', conversationId).eq('role', 'user')
        .contains('metadata', { client_message_id }).maybeSingle();
      if (!previousUserMessage || !isSameClientMessage(previousUserMessage.content, trimmedMessage)) {
        return jsonResponse({ error: 'This message identifier was already used for a different message.' }, 409, { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' });
      }
      const { data: previousReply } = await supabase.from('messages').select('*')
        .eq('conversation_id', conversationId).eq('role', 'assistant')
        .contains('metadata', { reply_to_client_message_id: client_message_id }).maybeSingle();
      if (previousReply) return jsonResponse({ conversation_id: conversationId, message: previousReply, sources: previousReply.metadata?.sources || [] }, 200, { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' });
    }

    const { data: historyData, error: historyError } = await supabase.from('messages')
      .select('*').eq('conversation_id', conversationId).in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false }).limit(10);
    if (historyError) return jsonResponse({ conversation_id: conversationId, error: 'Conversation is temporarily unavailable.', retryable: true }, 500);
    const history = ((historyData || []).reverse()) as Message[];
    const priorHistory = history.filter((entry) => entry.metadata?.client_message_id !== client_message_id);
    const result = await generateAnswerWithSources(business.id, business.name, trimmedMessage, aiContext, priorHistory);
    const { data: assistantMessage, error: assistantError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: result.answer,
      metadata: { sources: result.sources, reply_to_client_message_id: client_message_id },
    }).select('*').single();
    if (assistantError?.code === '23505') {
      const { data: existingReply } = await supabase.from('messages').select('*')
        .eq('conversation_id', conversationId).eq('role', 'assistant')
        .contains('metadata', { reply_to_client_message_id: client_message_id }).maybeSingle();
      if (existingReply) return jsonResponse({ conversation_id: conversationId, message: existingReply, sources: existingReply.metadata?.sources || [] }, 200, { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' });
    }
    if (assistantError || !assistantMessage) return jsonResponse({ conversation_id: conversationId, error: 'Could not save the response.', retryable: true }, 500);

    return jsonResponse({ conversation_id: conversationId, message: assistantMessage as Message, sources: result.sources }, 200, {
      'Access-Control-Allow-Origin': origin!,
      Vary: 'Origin',
    });
  } catch (error) {
    if (error instanceof AiQuotaError) {
      return jsonResponse({ conversation_id: activeConversationId, client_message_id: activeMessageId, error: error.message, retry_at: error.retryAt, retryable: true }, 429, origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
    }
    if (error instanceof AiUnavailableError) {
      return jsonResponse({ conversation_id: activeConversationId, client_message_id: activeMessageId, error: error.message, retryable: true }, 503, origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
    }
    if (error instanceof SyntaxError || (error instanceof Error && /too large|required/.test(error.message))) {
      return jsonResponse({ error: error.message || 'Invalid request.' }, 400);
    }
    console.error('Chat request failed:', error instanceof Error ? error.name : 'unknown error');
    return jsonResponse({ conversation_id: activeConversationId, client_message_id: activeMessageId, error: 'Chat is temporarily unavailable. Please try again later.', retryable: true }, 503, origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
  }
}
