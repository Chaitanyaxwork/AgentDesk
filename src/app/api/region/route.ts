import { NextRequest, NextResponse } from 'next/server';
import { regionFromTrustedCountry } from '@/lib/pricing';

const GEO_HEADERS: Record<string,string> = { vercel: 'x-vercel-ip-country', cloudflare: 'cf-ipcountry' };

export async function GET(req: NextRequest) {
  if (process.env.PRICING_TRUSTED_GEO_HEADER_CONFIRMED !== 'true') return NextResponse.json({ region: null });
  const header = GEO_HEADERS[process.env.PRICING_GEO_PROVIDER || ''];
  if (!header) return NextResponse.json({ region: null });
  return NextResponse.json({ region: regionFromTrustedCountry(req.headers.get(header)) });
}
