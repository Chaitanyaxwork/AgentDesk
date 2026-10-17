import Razorpay from 'razorpay';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function razorpayMode(): 'test' | 'live' | null {
  const mode = process.env.RAZORPAY_MODE;
  return mode === 'test' || mode === 'live' ? mode : null;
}

export function razorpayEnabled(): boolean {
  const mode = razorpayMode();
  return process.env.RAZORPAY_ENABLED === 'true' &&
    process.env.RAZORPAY_CHECKOUT_ENABLED === 'true' &&
    Boolean(mode) && (mode !== 'live' || process.env.RAZORPAY_LIVE_MODE_APPROVED === 'true') &&
    Boolean(process.env.RAZORPAY_KEY_ID) &&
    Boolean(process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpay(): Razorpay {
  if (!razorpayEnabled()) throw new Error('Razorpay is not configured.');
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
}

export function verifyRazorpaySignature(raw: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, secret: string): boolean {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${paymentId}|${subscriptionId}`).digest();
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
