import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AnalyticsData } from '@/lib/types';
import { subDays } from 'date-fns';

/**
 * GET /api/analytics
 * Computes business-level customer support analytics for the specified timeframe (7d, 30d, 90d).
 */
export async function GET(req: NextRequest) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || '30d';

  let days = 30;
  if (period === '7d') days = 7;
  else if (period === '90d') days = 90;

  const now = new Date();
  const startOfTodayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDate = subDays(startOfTodayDate, days);

  const supabase = createAdminClient();
  const businessId = authCtx.business.id;

  try {
    // 1. Fetch conversations within timeframe
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, status, satisfaction_score, summary, created_at, updated_at')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (convError) {
      console.error('Error fetching analytics conversations:', convError);
      return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
    }

    const convList = conversations || [];
    const sample_capped = convList.length >= 500;
    const convIds = convList.map((c) => c.id);

    // 2. Fetch messages for these conversations
    let messageList: Array<{
      id: string;
      conversation_id: string;
      role: string;
      created_at: string;
      content: string;
    }> = [];

    if (convIds.length > 0) {
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('id, conversation_id, role, created_at, content')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (msgError) {
        console.error('Error fetching analytics messages:', msgError);
        return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 });
      }
      messageList = (messages || []).reverse();
    }

    // 3. Compute High-Level Metrics
    const total_conversations = convList.length;
    let active_conversations = 0;
    let resolved_conversations = 0;
    let escalated_conversations = 0;

    for (const c of convList) {
      if (c.status === 'active') active_conversations++;
      else if (c.status === 'resolved') resolved_conversations++;
      else if (c.status === 'escalated') escalated_conversations++;

    }

    const avg_satisfaction_score = 0; // No customer rating flow is currently active.

    const resolution_rate =
      total_conversations > 0
        ? Math.round((resolved_conversations / total_conversations) * 100)
        : 0;

    // 4. Calculate Average AI Response Time
    let responseTimeSum = 0;
    let responseTimeCount = 0;

    // Group messages by conversation to calculate user->assistant latency
    const messagesByConv = new Map<string, typeof messageList>();
    for (const m of messageList) {
      const existing = messagesByConv.get(m.conversation_id) || [];
      existing.push(m);
      messagesByConv.set(m.conversation_id, existing);
    }

    for (const [, msgs] of messagesByConv.entries()) {
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
          const t1 = new Date(msgs[i].created_at).getTime();
          const t2 = new Date(msgs[i + 1].created_at).getTime();
          const diff = t2 - t1;
          if (diff > 0 && diff < 120000) {
            responseTimeSum += diff;
            responseTimeCount++;
          }
        }
      }
    }

    const avg_response_time_ms =
      responseTimeCount > 0
        ? Math.round(responseTimeSum / responseTimeCount)
        : 0;

    // 5. Messages Sent Today
    const messages_today = messageList.filter(
      (m) => new Date(m.created_at) >= startOfTodayDate
    ).length;

    // 6. Conversations & Satisfaction Over Time
    const dateMap = new Map<string, { count: number }>();

    // Initialize all dates in range with 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(startOfTodayDate.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      dateMap.set(d, { count: 0 });
    }

    for (const c of convList) {
      const d = new Date(c.created_at).toISOString().slice(0, 10);
      const entry = dateMap.get(d) || { count: 0 };
      entry.count += 1;
      dateMap.set(d, entry);
    }

    const conversations_over_time: { date: string; count: number }[] = [];
    const satisfaction_over_time: { date: string; score: number }[] = [];

    for (const [date, val] of dateMap.entries()) {
      conversations_over_time.push({ date, count: val.count });
    }

    // 7. Busiest Hours (0-23)
    const hourCounts: number[] = new Array(24).fill(0);
    for (const m of messageList) {
      const hour = new Date(m.created_at).getUTCHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const busiest_hours = hourCounts.map((count, hour) => ({ hour, count }));

    // 8. Top Topics Extraction
    const topicKeywords: Record<string, string[]> = {
      'Billing & Invoices': ['bill', 'invoice', 'charge', 'card', 'payment', 'receipt'],
      'Pricing & Plans': ['price', 'pricing', 'plan', 'tier', 'upgrade', 'downgrade', 'free trial'],
      'Account & Login': ['login', 'password', 'account', 'auth', 'sign in', 'email', 'verify'],
      'API & Webhooks': ['api', 'webhook', 'token', 'key', 'integration', 'sdk', 'endpoint'],
      'Widget Customization': ['widget', 'embed', 'color', 'avatar', 'style', 'script', 'branding'],
      'Product Setup': ['setup', 'install', 'getting started', 'configure', 'source', 'scrape'],
    };

    const topicFrequencies: Record<string, number> = {};
    for (const key of Object.keys(topicKeywords)) {
      topicFrequencies[key] = 0;
    }

    for (const m of messageList) {
      if (m.role === 'user') {
        const lower = m.content.toLowerCase();
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
          if (keywords.some((kw) => lower.includes(kw))) {
            topicFrequencies[topic] = (topicFrequencies[topic] || 0) + 1;
          }
        }
      }
    }

    const top_topics = Object.entries(topicFrequencies)
      .map(([topic, count], idx) => ({
        topic,
        count,
        trend: 'unavailable' as const,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const analyticsData: AnalyticsData = {
      total_conversations,
      active_conversations,
      resolved_conversations,
      escalated_conversations,
      avg_response_time_ms,
      avg_satisfaction_score,
      sample_capped,
      resolution_rate,
      top_topics,
      conversations_over_time,
      satisfaction_over_time,
      messages_today,
      busiest_hours,
    };

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error('Error in analytics GET:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
