import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Conversation } from '@/lib/types';

/**
 * GET /api/conversations
 * Returns paginated conversations for the authenticated user's business.
 * Supports filtering by status, full-text search across visitor and message content.
 */
export async function GET(req: NextRequest) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from('conversations')
      .select('*, messages(id, content, created_at, role)', { count: 'exact' })
      .eq('business_id', authCtx.business.id)
      .order('updated_at', { ascending: false });

    // Filter by status if not 'all'
    if (status && status !== 'all' && ['active', 'resolved', 'escalated'].includes(status)) {
      query = query.eq('status', status);
    }

    // Execute query with range
    const { data: rawConversations, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    // Map rows into Conversation types with message_count and last_message
    let mappedConversations: Conversation[] = (rawConversations || []).map((conv: any) => {
      const messagesList = Array.isArray(conv.messages) ? conv.messages : [];
      // Sort messages descending by creation date to get the last message
      const sortedMessages = [...messagesList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastMsg = sortedMessages.length > 0 ? sortedMessages[0].content : null;

      return {
        id: conv.id,
        business_id: conv.business_id,
        visitor_id: conv.visitor_id,
        visitor_name: conv.visitor_name,
        visitor_email: conv.visitor_email,
        visitor_location: conv.visitor_location,
        status: conv.status,
        satisfaction_score: conv.satisfaction_score,
        summary: conv.summary,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        message_count: messagesList.length,
        last_message: lastMsg,
      };
    });

    // Apply search filter if specified
    if (search) {
      const searchLower = search.toLowerCase();
      mappedConversations = mappedConversations.filter((c) => {
        const matchesName = c.visitor_name?.toLowerCase().includes(searchLower);
        const matchesEmail = c.visitor_email?.toLowerCase().includes(searchLower);
        const matchesLastMsg = c.last_message?.toLowerCase().includes(searchLower);
        return matchesName || matchesEmail || matchesLastMsg;
      });
    }

    return NextResponse.json({
      conversations: mappedConversations,
      total: count ?? mappedConversations.length,
      page,
      limit,
      total_pages: Math.ceil((count ?? mappedConversations.length) / limit),
    });
  } catch (error) {
    console.error('Unexpected error in conversations GET:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
