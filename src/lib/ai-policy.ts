import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';

export type AiRequestContext = {
  businessId: string;
  country: string | null;
  ipHash: string;
};

export class AiUnavailableError extends Error {
  constructor(message = 'AI is unavailable. Please try again later.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiQuotaError extends Error {
  readonly retryAt?: string;
  constructor(message: string, retryAt?: string) {
    super(message);
    this.name = 'AiQuotaError';
    this.retryAt = retryAt;
  }
}

const GEO_HEADERS: Record<string, string> = {
  vercel: 'x-vercel-ip-country',
  cloudflare: 'cf-ipcountry',
};
const IP_HEADERS: Record<string, string> = {
  vercel: 'x-vercel-forwarded-for',
  cloudflare: 'cf-connecting-ip',
};
const EEA_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI',
  'LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE',
]);

function trustedCountry(req: NextRequest): string | null {
  if (process.env.AI_TRUSTED_GEO_HEADER_CONFIRMED !== 'true') return null;
  const provider = process.env.AI_GEO_PROVIDER || '';
  const header = GEO_HEADERS[provider];
  if (!header) return null;
  const value = req.headers.get(header)?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) && value !== 'XX' ? value : null;
}

function subjectHash(req: NextRequest): string {
  const secret = process.env.AI_USAGE_HASH_SECRET;
  if (!secret || secret.length < 32) return '';
  const provider = process.env.AI_GEO_PROVIDER || '';
  const header = IP_HEADERS[provider];
  const raw = header ? req.headers.get(header)?.split(',').at(-1)?.trim() : undefined;
  // A shared unknown bucket is intentionally used when the hosting platform has no
  // configured trusted client-IP header. Never trust arbitrary X-Forwarded-For input.
  return createHmac('sha256', secret).update(raw || 'unknown-client').digest('hex');
}

export function createAiRequestContext(req: NextRequest, businessId: string): AiRequestContext {
  return { businessId, country: trustedCountry(req), ipHash: subjectHash(req) };
}

export function isAiRegionAllowed(country: string | null): boolean {
  if (!country) return false;
  return country !== 'GB' && country !== 'CH' && !EEA_COUNTRIES.has(country);
}

export function assertAiAvailable(context: AiRequestContext): void {
  if (process.env.AI_ENABLED !== 'true' || process.env.FREE_TIER_MODE !== 'true') {
    throw new AiUnavailableError('AI is temporarily disabled for this workspace.');
  }
  if (process.env.ALLOW_PAID_AI === 'true') {
    throw new AiUnavailableError('Paid AI requests are disabled in zero-spend mode.');
  }
  if (
    process.env.GEMINI_BILLING_DISABLED !== 'true' ||
    process.env.GEMINI_UNPAID_DATA_APPROVED !== 'true' ||
    !process.env.AI_USAGE_HASH_SECRET || process.env.AI_USAGE_HASH_SECRET.length < 32 ||
    !context.ipHash
  ) {
    throw new AiUnavailableError('AI is not configured for the zero-spend beta.');
  }
  if (
    !process.env.AI_TRUSTED_GEO_HEADER_CONFIRMED ||
    process.env.AI_TRUSTED_GEO_HEADER_CONFIRMED !== 'true' ||
    !isAiRegionAllowed(context.country)
  ) {
    throw new AiUnavailableError('AI is unavailable in this region.');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new AiUnavailableError('AI credentials are not configured.');
  }
}

export async function reserveAiUsage(
  context: AiRequestContext,
  isReply = false,
  isIngestion = false
): Promise<void> {
  assertAiAvailable(context);
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { FREE_PLAN_LIMITS, PRICING, isPlanKey } = await import('@/lib/pricing');
  const supabase = createAdminClient();
  const { data: business } = await supabase.from('businesses').select('plan').eq('id', context.businessId).maybeSingle();
  const activePlan = isPlanKey(business?.plan) ? PRICING[business.plan] : FREE_PLAN_LIMITS;
  const globalDailyLimit = boundedInt(process.env.AI_GLOBAL_DAILY_MAX_REQUESTS, 100, 1, 100);
  const configuredCap = boundedInt(process.env.AI_WORKSPACE_MONTHLY_MAX_REPLIES, 10000, 1, 10000);
  const workspaceMonthlyLimit = Math.min(activePlan.aiReplies, configuredCap);
  const ipMinuteLimit = boundedInt(process.env.AI_IP_MAX_REQUESTS_PER_MINUTE, 10, 1, 30);
  const { data, error } = isIngestion
    ? await supabase.rpc('reserve_ai_ingestion_usage', {
        p_ip_hash: context.ipHash,
        p_global_daily_limit: globalDailyLimit,
        p_ip_minute_limit: boundedInt(process.env.AI_INGEST_IP_MAX_REQUESTS_PER_MINUTE, 60, 1, 100),
      })
    : await supabase.rpc('reserve_ai_usage', {
        p_business_id: context.businessId,
        p_ip_hash: context.ipHash,
        p_is_reply: isReply,
        p_global_daily_limit: globalDailyLimit,
        p_workspace_monthly_limit: workspaceMonthlyLimit,
        p_ip_minute_limit: ipMinuteLimit,
      });
  if (error) {
    console.error('AI usage reservation failed:', error.code || 'database error');
    throw new AiUnavailableError('AI usage limits are unavailable. Please try again later.');
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    const retryAt = typeof result?.retry_at === 'string' ? result.retry_at : undefined;
    const message = result?.reason === 'workspace_monthly'
      ? 'This workspace has reached its monthly AI reply limit.'
      : result?.reason === 'ip_minute'
        ? 'Too many requests. Please wait a moment and try again.'
        : 'The daily AI request limit has been reached. Please try again after it resets.';
    throw new AiQuotaError(message, retryAt);
  }
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function aiModels() {
  return {
    generation: process.env.GEMINI_GENERATION_MODEL || 'gemini-3.8-flash',
    embedding: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
    embeddingDimensions: boundedInt(process.env.GEMINI_EMBEDDING_DIMENSIONS, 768, 768, 768),
    maxReplyTokens: boundedInt(process.env.MAX_AI_REPLY_TOKENS, 256, 1, 256),
    maxMessageChars: boundedInt(process.env.MAX_MESSAGE_CHARS, 2000, 100, 2000),
  };
}
