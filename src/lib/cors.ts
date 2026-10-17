import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors-policy';

export { corsHeaders } from '@/lib/cors-policy';

/**
 * Handles OPTIONS preflight requests for CORS enabled endpoints.
 */
export function handleOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Returns a JSON response with CORS headers attached.
 */
export function jsonResponse<T>(data: T, status: number = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
    },
  });
}
