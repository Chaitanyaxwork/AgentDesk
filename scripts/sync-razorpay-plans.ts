import { loadEnvConfig } from '@next/env';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import { PRICING, REGIONS, authoritativePrice, PlanKey, RegionKey } from '../src/lib/pricing';

loadEnvConfig(process.cwd());

async function main() {
  const mode = process.env.RAZORPAY_MODE;
  if (mode !== 'test' && mode !== 'live') throw new Error('Set RAZORPAY_MODE=test or live.');
  if (mode === 'live' && (!process.argv.includes('--confirm-live-plan-sync') || process.env.RAZORPAY_LIVE_MODE_APPROVED !== 'true')) throw new Error('Live plan sync requires RAZORPAY_LIVE_MODE_APPROVED=true and --confirm-live-plan-sync.');
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, NEXT_PUBLIC_SUPABASE_URL: url } = process.env;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!keyId || !keySecret || !url || !serviceKey) throw new Error('Razorpay credentials and Supabase server credentials are required.');
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const existingResult = await db.from('billing_plan_mappings').select('plan_key,currency,interval_key,razorpay_plan_id,amount_subunits,period').eq('mode',mode);
  if (existingResult.error) throw new Error(`Cannot read plan mappings. Apply the billing migration first (${existingResult.error.code}).`);
  const existing = new Map((existingResult.data || []).map((row) => [`${row.plan_key}:${row.currency}:${row.interval_key}`, row]));
  const remotePlans = await razorpay.plans.all({ count: 100 });
  const failures: string[] = [];
  for (const plan of ['starter','growth','scale'] as const satisfies readonly PlanKey[]) {
    for (const region of ['IN','USD','GB','EUR'] as const satisfies readonly RegionKey[]) {
      for (const interval of ['monthly','annual'] as const) {
        const price = authoritativePrice(plan, region, interval);
        const mapKey = `${plan}:${price.currency}:${interval}`;
        const known = existing.get(mapKey);
        if (known) {
          if (Number(known.amount_subunits) !== price.amountSubunits || known.period !== price.period) throw new Error(`Stored price differs from code for ${mapKey}; reconcile the mapping manually.`);
          console.log(`Reuse ${mapKey} -> ${known.razorpay_plan_id}`);
          continue;
        }
        try {
          const noteMatches = (candidate: typeof remotePlans.items[number]) =>
            candidate.notes?.agentdesk_plan === plan && candidate.notes?.region === region && candidate.notes?.interval_key === interval &&
            candidate.item?.amount === price.amountSubunits && candidate.item?.currency === price.currency && candidate.period === price.period && candidate.interval === 1;
          const remote = remotePlans.items.find(noteMatches) || await razorpay.plans.create({
            period: price.period,
            interval: 1,
            item: { name: `AgentDesk ${PRICING[plan].name} (${REGIONS[region].currency}, ${interval})`, amount: price.amountSubunits, currency: price.currency, description: `${PRICING[plan].name} subscription, ${interval}` },
            notes: { agentdesk_plan: plan, region, currency: price.currency, interval_key: interval },
          });
          const { error } = await db.from('billing_plan_mappings').insert({ mode, plan_key: plan, currency: price.currency, interval_key: interval, period: price.period, amount_subunits: price.amountSubunits, razorpay_plan_id: remote.id, active: true });
          if (error) throw new Error(`Remote plan ${remote.id} could not be mapped (${error.code}); rerun safely after resolving it.`);
          console.log(`Synchronized ${mapKey} -> ${remote.id}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'unsupported currency or interval';
          failures.push(`${mapKey}: ${reason}`);
          console.error(`Unavailable ${mapKey}: ${reason}`);
        }
      }
    }
  }
  if (failures.length) throw new Error(`${failures.length} combinations were not synchronized. Checkout will remain disabled for those currencies/intervals.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Plan synchronization failed.'); process.exitCode = 1; });
