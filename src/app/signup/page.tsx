'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/shared/logo';
import { toast } from 'sonner';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { formatPlanPrice, isPlanKey, PRICING, RegionKey, PlanKey, BillingInterval, REGIONS } from '@/lib/pricing';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanKey>('free');
  const [region, setRegion] = useState<RegionKey>('USD');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedPlan = params.get('plan');
    const currency = params.get('currency');
    setPlan(isPlanKey(selectedPlan) ? selectedPlan : 'free');
    setRegion(currency === 'INR' ? 'IN' : currency === 'GBP' ? 'GB' : currency === 'EUR' ? 'EUR' : 'USD');
    setInterval(params.get('interval') === 'annual' ? 'annual' : 'monthly');
  }, []);

  const billingPath = `/dashboard/billing?plan=${plan}&currency=${REGIONS[region].currency}&interval=${interval}`;
  const selectedPrice = formatPlanPrice(plan, region, interval);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const client = createClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            full_name: name,
            requested_plan: plan,
            requested_region: region,
            requested_currency: REGIONS[region].currency,
            requested_interval: interval,
          },
          emailRedirectTo: `${location.origin}${billingPath}`,
        },
      });
      if (error) throw error;
      if (data.session) {
        toast.success('Your free beta workspace is ready');
        router.push(billingPath);
      } else {
        toast.success('Check your email to verify your account.');
      }
    } catch {
      toast.error('Unable to create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    try {
      const client = createClient();
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${billingPath}` } });
      if (error) throw error;
    } catch {
      toast.error('Google sign up is unavailable right now.');
    }
  }

  return <main className="flex min-h-screen items-center justify-center px-5 py-10">
    <Link href="/" className="absolute left-6 top-6 text-sm text-zinc-500 hover:text-white"><ArrowLeft className="mr-1 inline" size={15}/> Back</Link>
    <div className="w-full max-w-[440px]">
      <div className="mb-8 flex justify-center"><Logo/></div>
      <div className="card p-8">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-center text-sm text-zinc-400">Free beta workspace</p>
        <div className="mt-5 rounded-xl border border-indigo-500/20 bg-indigo-500/[.06] p-4 text-sm">
          <p className="font-medium">{PRICING[plan].name} · {selectedPrice.monthly} / month</p>
          {interval === 'annual' && <p className="mt-1 text-xs text-zinc-400">{selectedPrice.annualTotal} billed annually ({selectedPrice.annualMonthlyEquivalent} monthly equivalent).</p>}
          <p className="mt-2 text-xs leading-5 text-zinc-400">This is your requested plan and display currency. Only the Free beta is active; paid checkout is not connected and no charge will be made.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-zinc-300">Your name<input className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm" required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name"/></label>
          <label className="block text-sm text-zinc-300">Work email<input className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email"/></label>
          <label className="block text-sm text-zinc-300">Password<input className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="At least 8 characters"/></label>
          <button disabled={busy} className="button mt-2 w-full rounded-lg bg-indigo-500 py-3 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-60">{busy ? <LoaderCircle className="mx-auto animate-spin" size={18}/> : 'Create free account'}</button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs text-zinc-600"><span className="h-px flex-1 bg-zinc-800"/>Or continue with<span className="h-px flex-1 bg-zinc-800"/></div>
        <button onClick={google} className="w-full rounded-lg border border-zinc-700 py-3 text-sm font-medium hover:bg-white/5">◎　Continue with Google</button>
        <p className="mt-6 text-center text-sm text-zinc-500">Already have an account? <Link href="/login" className="text-indigo-300 hover:text-indigo-200">Sign in</Link></p>
      </div>
      <p className="mt-6 text-center text-xs text-zinc-600">The beta may process AI requests using a Google unpaid service. Avoid personal, sensitive, or confidential information.</p>
    </div>
  </main>;
}
