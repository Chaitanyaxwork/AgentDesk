'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ANNUAL_DISCOUNT_PERCENT, formatPlanPrice, isPlanKey, PRICING, RegionKey, REGIONS, regionFromLocale } from '@/lib/pricing';

const PLAN_ORDER = ['free', 'starter', 'growth', 'scale'] as const;

export function PricingSection() {
  const [region, setRegion] = useState<RegionKey>('USD');
  const [annual, setAnnual] = useState(false);
  useEffect(() => {
    setRegion(regionFromLocale(navigator.language));
    fetch('/api/region').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.region && Object.hasOwn(REGIONS, data.region)) setRegion(data.region as RegionKey); })
      .catch(() => undefined);
  }, []);

  return <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
    <div className="text-center">
      <p className="text-sm font-semibold text-indigo-400">PROPOSED BETA PRICING</p>
      <h2 className="mt-3 text-4xl font-semibold tracking-tight">Plans that grow with you</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Prices use fixed regional configuration. Razorpay checkout is available only after test credentials, account approval, migrations, and plan synchronization are configured.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <label className="sr-only" htmlFor="pricing-region">Display currency region</label>
        <select id="pricing-region" value={region} onChange={(event) => setRegion(event.target.value as RegionKey)} className="rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-xs text-zinc-200">
          {Object.entries(REGIONS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[.03] p-1 text-xs">
          <button type="button" onClick={() => setAnnual(false)} className={`rounded-full px-4 py-2 ${!annual ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>Monthly</button>
          <button type="button" onClick={() => setAnnual(true)} className={`rounded-full px-4 py-2 ${annual ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>Annual · {ANNUAL_DISCOUNT_PERCENT}% proposed discount</button>
        </div>
      </div>
    </div>
    <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {PLAN_ORDER.map((key) => {
        const plan = PRICING[key];
        const price = formatPlanPrice(key, region, annual ? 'annual' : 'monthly');
        const query = new URLSearchParams({ plan: key, currency: REGIONS[region].currency, interval: annual ? 'annual' : 'monthly' });
        const features = [
          `${plan.aiReplies.toLocaleString()} AI replies / month`,
          `${plan.sources} knowledge ${plan.sources === 1 ? 'source' : 'sources'}`,
          `${plan.members} workspace ${plan.members === 1 ? 'member' : 'members'}`,
          plan.branding ? 'AgentDesk branding' : 'Branding controls planned',
        ];
        return <article key={key} className={`rounded-2xl border p-6 ${key === 'starter' ? 'border-indigo-500/50 bg-indigo-500/[.06]' : 'border-white/[.08] bg-[#111114]'}`}>
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <p className="mt-4 text-3xl font-semibold">{price.monthly}<span className="text-xs font-normal text-zinc-500"> / month</span></p>
          {annual && <p className="mt-1 text-xs text-zinc-500">{price.annualTotal} billed annually ({price.annualMonthlyEquivalent} monthly equivalent).</p>}
          <ul className="mt-6 space-y-3 border-t border-white/10 pt-5">{features.map((feature) => <li key={feature} className="flex gap-2 text-xs text-zinc-300"><Check className="shrink-0 text-emerald-400" size={15}/>{feature}</li>)}</ul>
          <p className="mt-4 min-h-10 text-[11px] leading-5 text-zinc-500">Usage limits are enforced server-side. Zero-spend provider-wide caps may be lower than plan limits.</p>
          <Link href={`/signup?${query}`} className={`mt-5 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${key === 'free' ? 'bg-indigo-500 hover:bg-indigo-400' : 'border border-zinc-700 hover:bg-white/5'}`}>
            {key === 'free' ? 'Start free beta' : 'Request early access'} <ArrowRight size={15}/>
          </Link>
        </article>;
      })}
    </div>
  </section>;
}
