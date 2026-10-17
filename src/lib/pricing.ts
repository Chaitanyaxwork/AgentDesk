export type RegionKey = 'IN' | 'USD' | 'GB' | 'EUR';
export type PlanKey = 'free' | 'starter' | 'growth' | 'scale';
export type BillingInterval = 'monthly' | 'annual';

export const REGIONS: Record<RegionKey, { label: string; currency: string; locale: string }> = {
  IN: { label: 'India (INR)', currency: 'INR', locale: 'en-IN' },
  USD: { label: 'United States / international (USD)', currency: 'USD', locale: 'en-US' },
  GB: { label: 'United Kingdom (GBP)', currency: 'GBP', locale: 'en-GB' },
  EUR: { label: 'Eurozone (EUR)', currency: 'EUR', locale: 'de-DE' },
};

export const PRICING: Record<PlanKey, {
  name: string;
  monthly: Record<RegionKey, number>;
  aiReplies: number;
  sources: number;
  members: number;
  branding: boolean;
}> = {
  free: { name: 'Free', monthly: { IN: 0, USD: 0, GB: 0, EUR: 0 }, aiReplies: 100, sources: 1, members: 1, branding: true },
  starter: { name: 'Starter', monthly: { IN: 499, USD: 9, GB: 7, EUR: 8 }, aiReplies: 500, sources: 3, members: 1, branding: true },
  growth: { name: 'Growth', monthly: { IN: 1499, USD: 29, GB: 23, EUR: 27 }, aiReplies: 2000, sources: 10, members: 3, branding: false },
  scale: { name: 'Scale', monthly: { IN: 4999, USD: 99, GB: 79, EUR: 89 }, aiReplies: 10000, sources: 25, members: 5, branding: false },
};

export const ANNUAL_DISCOUNT_PERCENT = 20;

const EURO_COUNTRIES = new Set(['AT','BE','BG','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK']);

export function regionFromLocale(locale: string | undefined): RegionKey {
  if (!locale) return 'USD';
  try {
    const region = new Intl.Locale(locale).maximize().region?.toUpperCase();
    if (region === 'IN') return 'IN';
    if (region === 'GB') return 'GB';
    if (region && EURO_COUNTRIES.has(region)) return 'EUR';
  } catch { /* Invalid browser locale falls back to USD. */ }
  return 'USD';
}

export function regionFromTrustedCountry(country: string | null | undefined): RegionKey | null {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  if (code === 'IN') return 'IN';
  if (code === 'GB') return 'GB';
  return EURO_COUNTRIES.has(code) ? 'EUR' : 'USD';
}

export function formatPlanPrice(plan: PlanKey, region: RegionKey, interval: BillingInterval): {
  monthly: string;
  annualTotal: string;
  annualMonthlyEquivalent: string;
} {
  const { currency, locale } = REGIONS[region];
  const monthly = PRICING[plan].monthly[region];
  const annualTotal = Math.round(monthly * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100;
  const displayedMonthly = interval === 'annual' ? annualTotal / 12 : monthly;
  const fmt = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  return { monthly: fmt(displayedMonthly), annualTotal: fmt(annualTotal), annualMonthlyEquivalent: fmt(annualTotal / 12) };
}

export function authoritativePrice(plan: PlanKey, region: RegionKey, interval: BillingInterval) {
  const monthlyAmount = PRICING[plan].monthly[region];
  const amount = interval === 'annual'
    ? Math.round(monthlyAmount * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100
    : monthlyAmount;
  return {
    amount,
    currency: REGIONS[region].currency,
    amountSubunits: Math.round(amount * 100),
    period: interval === 'annual' ? 'yearly' as const : 'monthly' as const,
    interval: 1,
  };
}

export const FREE_PLAN_LIMITS = PRICING.free;

export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return value === 'free' || value === 'starter' || value === 'growth' || value === 'scale';
}

export function isRegionKey(value: string | null | undefined): value is RegionKey {
  return value === 'IN' || value === 'USD' || value === 'GB' || value === 'EUR';
}
