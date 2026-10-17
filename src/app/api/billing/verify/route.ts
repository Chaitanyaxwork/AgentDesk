import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRazorpay, razorpayEnabled, verifyCheckoutSignature } from '@/lib/razorpay';
import { isSameOriginWrite } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!razorpayEnabled()) return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 503 });
  try {
    const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = await req.json();
    if (typeof paymentId !== 'string' || typeof subscriptionId !== 'string' || typeof signature !== 'string' || !verifyCheckoutSignature(paymentId, subscriptionId, signature, process.env.RAZORPAY_KEY_SECRET || '')) {
      return NextResponse.json({ error: 'Payment evidence could not be verified.' }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: record } = await supabase.from('agentdesk_subscriptions').select('id, razorpay_plan_id')
      .eq('razorpay_subscription_id', subscriptionId).eq('business_id', auth.business.id).maybeSingle();
    if (!record) return NextResponse.json({ error: 'Subscription not found for this workspace.' }, { status: 404 });
    const remote = await getRazorpay().subscriptions.fetch(subscriptionId);
    if (remote.plan_id !== record.razorpay_plan_id) return NextResponse.json({ error: 'Subscription plan validation failed.' }, { status: 400 });
    const { error: updateError } = await supabase.from('agentdesk_subscriptions').update({ checkout_verified_at: new Date().toISOString() }).eq('id', record.id);
    if (updateError) return NextResponse.json({ error: 'Payment was checked, but local state could not be updated. Wait for the webhook.' }, { status: 503 });
    return NextResponse.json({ verified: true, status: 'awaiting_webhook', message: 'Payment evidence verified. Workspace access changes only after a signed Razorpay webhook.' });
  } catch {
    return NextResponse.json({ error: 'Could not verify checkout. Please wait for the webhook update.' }, { status: 503 });
  }
}
