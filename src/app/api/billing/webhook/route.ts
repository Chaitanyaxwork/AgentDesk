import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpaySignature } from '@/lib/razorpay';

const EVENT_STATUS: Record<string, string> = {
  'subscription.authenticated': 'authenticated', 'subscription.activated': 'active', 'subscription.charged': 'active',
  'subscription.pending': 'pending', 'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled', 'subscription.paused': 'paused',
  'subscription.resumed': 'active', 'subscription.completed': 'completed',
};

export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') || 0) > 256_000) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Missing payload.' }, { status: 400 });
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256_000) { await reader.cancel(); return NextResponse.json({ error: 'Payload too large.' }, { status: 413 }); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  if (!verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }
  try {
    const event = JSON.parse(raw);
    const status = EVENT_STATUS[event?.event];
    const entity = event?.payload?.subscription?.entity;
    const subscriptionId = typeof entity?.id === 'string' ? entity.id : null;
    if (!event?.event || !subscriptionId) return NextResponse.json({ received: true, ignored: true });
    const eventId = req.headers.get('x-razorpay-event-id') || createHash('sha256').update(raw).digest('hex');
    const client = createAdminClient();
    const { error } = await client.rpc('apply_razorpay_subscription_event', {
      p_event_id: eventId,
      p_event_type: String(event.event).slice(0, 100),
      p_event_created_at: Number.isInteger(event.created_at) ? event.created_at : Math.floor(Date.now() / 1000),
      p_subscription_id: subscriptionId,
      p_status: status || 'unknown',
      p_current_end: Number.isInteger(entity.current_end) ? new Date(entity.current_end * 1000).toISOString() : null,
    });
    if (error) {
      console.error('Razorpay webhook persistence failed:', error.code || 'database error');
      return NextResponse.json({ error: 'Webhook could not be processed.' }, { status: 503 });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook payload is invalid.' }, { status: 400 });
  }
}
