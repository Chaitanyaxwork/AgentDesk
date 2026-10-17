import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConversationWithMessages, Message } from '@/lib/types';

/**
 * GET /api/conversations/[id]
 * Returns full details of a conversation including all messages ordered chronologically.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const conversationId = resolvedParams.id;
  const supabase = createAdminClient();

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('business_id', authCtx.business.id)
    .maybeSingle();

  if (convError || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('Error fetching messages:', messagesError);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  const lastMsg =
    messages && messages.length > 0
      ? messages[messages.length - 1].content
      : null;

  const result: ConversationWithMessages = {
    ...conv,
    message_count: messages?.length || 0,
    last_message: lastMsg,
    messages: (messages as Message[]) || [],
  };

  return NextResponse.json(result);
}

/**
 * PUT /api/conversations/[id]
 * Updates conversation status (resolved, escalated, active), satisfaction score, or adds notes.
 * Automatically inserts a system event message into the transcript.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParams = await params;
  const conversationId = resolvedParams.id;
  const supabase = createAdminClient();

  // Validate conversation existence & authorization
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('business_id', authCtx.business.id)
    .maybeSingle();

  if (convError || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { status, satisfaction_score, summary, system_note } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    let statusChanged = false;
    if (status && ['active', 'resolved', 'escalated'].includes(status) && status !== conv.status) {
      updates.status = status;
      statusChanged = true;
    }

    if (satisfaction_score !== undefined) {
      const score = Number(satisfaction_score);
      if (score >= 1 && score <= 5) {
        updates.satisfaction_score = score;
      }
    }

    if (typeof summary === 'string') {
      updates.summary = summary;
    }

    // Apply conversation update
    const { data: updatedConv, error: updateError } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .select('*')
      .single();

    if (updateError || !updatedConv) {
      console.error('Error updating conversation:', updateError);
      return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
    }

    // Insert system message if status changed or a note was provided
    if (statusChanged || system_note) {
      const messageContent =
        system_note ||
        `Status changed from "${conv.status}" to "${updates.status}" by agent.`;

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'system',
        content: messageContent,
        metadata: {
          previous_status: conv.status,
          new_status: updates.status || conv.status,
          updated_by: authCtx.user.email,
        },
      });
    }

    // Return refreshed conversation with messages
    const { data: allMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const responseData: ConversationWithMessages = {
      ...updatedConv,
      message_count: allMessages?.length || 0,
      last_message: allMessages && allMessages.length > 0 ? allMessages[allMessages.length - 1].content : null,
      messages: (allMessages as Message[]) || [],
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error in conversation PUT:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
