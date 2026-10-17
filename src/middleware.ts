import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/keys';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: Parameters<SetAllCookies>[0]) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (path.startsWith('/dashboard') && !user) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    return NextResponse.redirect(target);
  }
  if (user && (path === '/login' || path === '/signup')) {
    const target = request.nextUrl.clone();
    target.pathname = '/dashboard';
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = { matcher: ['/dashboard/:path*', '/login', '/signup'] };
