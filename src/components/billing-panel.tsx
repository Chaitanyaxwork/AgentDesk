'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ANNUAL_DISCOUNT_PERCENT, formatPlanPrice, isPlanKey, isRegionKey, PlanKey, RegionKey, REGIONS } from '@/lib/pricing';

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void }; }
}

type BillingState = {
  active_plan: PlanKey;
  billing_connected: boolean;
  requested_plan: PlanKey | null;
  requested_region: RegionKey | null;
  ai_replies_used: number;
  ai_replies_limit: number;
  reset_at: string;
  subscription: null | { plan: PlanKey; region: RegionKey; currency: string; interval: 'monthly'|'annual'; amount: number; status: string; next_billing_at: string | null; cancellation_requested: boolean; provider_id: string };
};

export function BillingPanel() {
  const [data, setData] = useState<BillingState | null>(null);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanKey>('starter');
  const [region, setRegion] = useState<RegionKey>('USD');
  const [interval, setInterval] = useState<'monthly'|'annual'>('monthly');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch('/api/billing');
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'Billing state could not be loaded.');
    setData(payload);
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isPlanKey(params.get('plan')) && params.get('plan') !== 'free') setPlan(params.get('plan') as PlanKey);
    const currency = params.get('currency');
    setRegion(currency === 'INR' ? 'IN' : currency === 'GBP' ? 'GB' : currency === 'EUR' ? 'EUR' : 'USD');
    if (params.get('interval') === 'annual') setInterval('annual');
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'Billing state could not be loaded.'));
  }, []);

  async function startCheckout() {
    setBusy(true);
    try {
      const response = await fetch('/api/billing/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, region, interval }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Checkout is unavailable.');
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load Razorpay Checkout.')); document.body.appendChild(script);
        });
      }
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');
      const checkout = new window.Razorpay({
        key: payload.key_id, subscription_id: payload.subscription_id, name: 'AgentDesk',
        description: `${plan[0].toUpperCase()}${plan.slice(1)} · ${interval}`,
        theme: { color: '#7467f0' },
        handler: async (payment: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          const verify = await fetch('/api/billing/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment) });
          const result = await verify.json().catch(() => null);
          if (!verify.ok) { toast.error(result?.error || 'Payment verification is pending.'); return; }
          toast.success(result.message || 'Payment verified; subscription activation is awaiting webhook confirmation.');
          refresh().catch(() => undefined);
        },
      });
      checkout.open();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Checkout is unavailable.'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!data?.subscription) return;
    setBusy(true);
    try {
      const response = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription_id: data.subscription.provider_id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Cancellation could not be requested.');
      toast.success(payload.message); await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Cancellation could not be requested.'); }
    finally { setBusy(false); }
  }

  const sub = data?.subscription;
  const price = formatPlanPrice(plan, region, interval);
  return <main className="mx-auto max-w-6xl px-6 py-8">
    <header className="mb-6"><h1 className="text-2xl font-semibold">Billing</h1><p className="mt-1 text-sm text-zinc-400">Your verified subscription status and usage.</p></header>
    {error && <p role="alert" className="mb-4 rounded-lg border border-amber-500/20 p-3 text-sm text-amber-200">{error}</p>}
    <section className="max-w-3xl rounded-2xl border border-white/[.08] bg-[#111114] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-zinc-500">Current plan</p><h2 className="mt-1 text-xl font-semibold capitalize">{data?.active_plan || 'Loading…'}</h2></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-zinc-300">{sub?.status || 'Free beta'}</span></div>
      {sub && <div className="mt-5 grid gap-3 border-t border-white/[.07] pt-5 text-sm sm:grid-cols-2"><p>Price: {new Intl.NumberFormat(REGIONS[sub.region].locale,{style:'currency',currency:sub.currency}).format(sub.amount)} / {sub.interval === 'annual' ? 'year' : 'month'}</p><p>Region: {REGIONS[sub.region].label}</p><p>Next billing: {sub.next_billing_at ? format(new Date(sub.next_billing_at),'MMM d, yyyy') : 'Not available yet'}</p><p>Cancellation: {sub.cancellation_requested ? 'Requested; awaiting provider confirmation' : 'Not requested'}</p>{['created','active','pending','halted','paused','authenticated'].includes(sub.status) && !sub.cancellation_requested && <button disabled={busy} onClick={cancel} className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs text-rose-200 disabled:opacity-50">{sub.status === 'created' ? 'Cancel unpaid checkout' : 'Request cancellation'}</button>}</div>}
      {data && <div className="mt-6 border-t border-white/[.07] pt-5"><div className="flex justify-between text-xs"><span className="text-zinc-400">AI replies this month</span><span>{data.ai_replies_used} / {data.ai_replies_limit}</span></div><div className="mt-2 h-2 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-indigo-500" style={{width:`${Math.min(100, data.ai_replies_limit ? data.ai_replies_used/data.ai_replies_limit*100 : 0)}%`}}/></div><p className="mt-2 text-xs text-zinc-500">Resets {format(new Date(data.reset_at),'MMM d, yyyy')} UTC.</p></div>}
      <div className="mt-7 border-t border-white/[.07] pt-5"><h3 className="font-medium">Choose a subscription</h3><p className="mt-1 text-xs text-zinc-500">Prices come from server configuration. Checkout requires configured test credentials, test plan mappings, the billing migration, and Razorpay account support.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-zinc-400">Plan<select className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-900 p-2" value={plan} onChange={e=>setPlan(e.target.value as PlanKey)}>{(['starter','growth','scale'] as const).map(p=><option value={p} key={p}>{p}</option>)}</select></label><label className="text-xs text-zinc-400">Region<select className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-900 p-2" value={region} onChange={e=>isRegionKey(e.target.value)&&setRegion(e.target.value)}>{Object.entries(REGIONS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label><label className="text-xs text-zinc-400">Billing interval<select className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-900 p-2" value={interval} onChange={e=>setInterval(e.target.value as 'monthly'|'annual')}><option value="monthly">Monthly</option><option value="annual">Annual · {ANNUAL_DISCOUNT_PERCENT}% off</option></select></label></div><p className="mt-3 text-sm">{interval === 'annual' ? `${price.annualTotal} billed yearly` : `${price.monthly} each month`}</p><button disabled={busy || !data?.billing_connected || Boolean(sub && ['active','created','pending','authenticated'].includes(sub.status))} onClick={startCheckout} className="mt-4 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Starting…' : data?.billing_connected ? 'Continue with Razorpay checkout' : 'Checkout unavailable'}</button><p className="mt-3 text-[11px] leading-5 text-zinc-500">A browser success message never activates a plan. AgentDesk grants paid limits only after a verified Razorpay webhook.</p></div>
    </section>
  </main>;
}
