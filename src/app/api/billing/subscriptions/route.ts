import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { authoritativePrice, isPlanKey, isRegionKey } from '@/lib/pricing';
import { getRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { isSameOriginWrite } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (auth.business.user_id !== auth.user.id) return NextResponse.json({ error: 'Only the workspace owner can manage billing.' }, { status: 403 });
  if (!razorpayEnabled()) return NextResponse.json({ error: 'Checkout is unavailable until Razorpay test credentials and operator settings are configured.' }, { status: 503 });

  try {
    const body = await req.json();
    const plan = body?.plan;
    const region = body?.region;
    const interval = body?.interval;
    if (!isPlanKey(plan) || plan === 'free' || !isRegionKey(region) || !['monthly', 'annual'].includes(interval)) {
      return NextResponse.json({ error: 'Choose a valid paid plan and billing region.' }, { status: 400 });
    }
    const price = authoritativePrice(plan, region, interval);
    const mode = process.env.RAZORPAY_MODE;
    if (mode !== 'test' && mode !== 'live') return NextResponse.json({ error: 'Razorpay mode is invalid.' }, { status: 503 });
    const supabase = createAdminClient();
    const { data: existing } = await supabase.from('agentdesk_subscriptions').select('status')
      .eq('business_id', auth.business.id).in('status', ['created','authenticated','active','pending','halted','paused']).limit(1).maybeSingle();
    if (existing) return NextResponse.json({ error: existing.status === 'created' ? 'A checkout is already pending for this workspace.' : 'A current subscription must be cancelled or changed before starting another checkout.' }, { status: 409 });
    const { data: mapping, error: mappingError } = await supabase.from('billing_plan_mappings')
      .select('razorpay_plan_id, amount_subunits, currency, period')
      .eq('mode', mode).eq('plan_key', plan).eq('currency', price.currency).eq('interval_key', interval).eq('active', true).maybeSingle();
    if (mappingError || !mapping || mapping.amount_subunits !== price.amountSubunits || mapping.currency !== price.currency || mapping.period !== price.period) {
      return NextResponse.json({ error: 'This currency and billing interval are not configured for your Razorpay account.' }, { status: 503 });
    }

    const client = getRazorpay();
    const subscription = await client.subscriptions.create({
      plan_id: mapping.razorpay_plan_id,
      total_count: interval === 'annual' ? 10 : 120,
      quantity: 1,
      customer_notify: false,
      notes: { business_id: auth.business.id, owner_id: auth.user.id, plan_key: plan, currency: price.currency, interval_key: interval },
    });
    const { error: storeError } = await supabase.from('agentdesk_subscriptions').insert({
      business_id: auth.business.id,
      owner_id: auth.user.id,
      plan_key: plan,
      region_key: region,
      currency: price.currency,
      interval_key: interval,
      amount_subunits: price.amountSubunits,
      mode,
      razorpay_plan_id: mapping.razorpay_plan_id,
      razorpay_subscription_id: subscription.id,
      status: 'created',
    });
    if (storeError) {
      try { await client.subscriptions.cancel(subscription.id, false); } catch { /* remote cleanup is best effort */ }
      console.error('Subscription persistence failed:', storeError.code || 'database error');
      return NextResponse.json({ error: 'Could not save subscription state. Please retry.' }, { status: 503 });
    }
    return NextResponse.json({ subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID, mode: process.env.RAZORPAY_MODE, plan: { name: plan, currency: price.currency, amount_subunits: price.amountSubunits, interval } });
  } catch (error) {
    console.error('Razorpay subscription creation failed:', error instanceof Error ? error.name : 'unknown error');
    return NextResponse.json({ error: 'Could not start checkout. Please try again later.' }, { status: 503 });
  }
}
