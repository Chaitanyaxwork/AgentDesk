import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREE_PLAN_LIMITS, PRICING, isPlanKey, isRegionKey } from '@/lib/pricing';
import { razorpayEnabled } from '@/lib/razorpay';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const resetAt = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString();
  const { data, error } = await supabase.from('ai_usage_windows').select('request_count')
    .eq('scope_type', 'business_month').eq('scope_key', auth.business.id).eq('window_start', monthStart).maybeSingle();
  if (error) {
    console.error('Billing usage lookup failed:', error.code || 'database error');
    return NextResponse.json({ error: 'Usage details are unavailable until the database migration is applied.' }, { status: 503 });
  }

  const requestedPlanValue = auth.user.user_metadata?.requested_plan;
  const requestedRegionValue = auth.user.user_metadata?.requested_region;
  const { data: subscription, error: subscriptionError } = await supabase.from('agentdesk_subscriptions')
    .select('plan_key,region_key,currency,interval_key,amount_subunits,status,current_end,cancel_requested_at,created_at,razorpay_subscription_id')
    .eq('business_id', auth.business.id).in('status', ['created','authenticated','active','pending','halted','paused'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (subscriptionError) return NextResponse.json({ error: 'Billing state is unavailable until the billing migration is applied.' }, { status: 503 });
  const activePlanKey = isPlanKey(auth.business.plan) ? auth.business.plan : 'free';
  const activePlan = PRICING[activePlanKey];
  return NextResponse.json({
    active_plan: activePlanKey,
    billing_connected: razorpayEnabled(),
    subscription: subscription ? {
      plan: subscription.plan_key, region: subscription.region_key, currency: subscription.currency,
      interval: subscription.interval_key, amount: Number(subscription.amount_subunits) / 100,
      status: subscription.status, next_billing_at: subscription.current_end,
      cancellation_requested: Boolean(subscription.cancel_requested_at), provider_id: subscription.razorpay_subscription_id,
    } : null,
    requested_plan: isPlanKey(requestedPlanValue) ? requestedPlanValue : null,
    requested_region: isRegionKey(requestedRegionValue) ? requestedRegionValue : null,
    ai_replies_used: data?.request_count || 0,
    ai_replies_limit: Math.min(activePlan.aiReplies, Math.max(1, Math.min(10000, Number(process.env.AI_WORKSPACE_MONTHLY_MAX_REPLIES) || 10000))),
    reset_at: resetAt,
  });
}
