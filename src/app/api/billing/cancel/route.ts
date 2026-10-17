import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { isSameOriginWrite } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  if (!isSameOriginWrite(req)) return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.business.user_id !== auth.user.id) return NextResponse.json({ error: 'Only the workspace owner can manage billing.' }, { status: 403 });
  if (!razorpayEnabled()) return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  try {
    const { subscription_id: subscriptionId } = await req.json();
    if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
    const supabase = createAdminClient();
    const { data: row } = await supabase.from('agentdesk_subscriptions').select('id,status')
      .eq('razorpay_subscription_id', subscriptionId).eq('business_id', auth.business.id).maybeSingle();
    if (!row || !['created','active','pending','halted','paused','authenticated'].includes(row.status)) return NextResponse.json({ error: 'No cancellable subscription was found.' }, { status: 404 });
    const immediate = row.status === 'created';
    await getRazorpay().subscriptions.cancel(subscriptionId, !immediate);
    const { error } = await supabase.from('agentdesk_subscriptions').update(immediate ? { status: 'expired' } : { cancel_requested_at: new Date().toISOString() }).eq('id', row.id);
    if (error) return NextResponse.json({ error: 'Cancellation was requested but could not be recorded locally. Wait for the webhook before retrying.' }, { status: 503 });
    return NextResponse.json({ cancellation_requested: true, status: row.status, message: immediate ? 'Unpaid checkout cancelled.' : 'Cancellation requested. Access changes after Razorpay confirms the effective subscription state.' });
  } catch {
    return NextResponse.json({ error: 'Could not request cancellation. Please try again.' }, { status: 503 });
  }
}
