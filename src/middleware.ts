import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export function middleware(req: NextRequest) {
  // Skip if no password is configured — auth is disabled
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always allow login page and auth API
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Check auth cookie
  const token = req.cookies.get('auth')?.value;
  const expected = Buffer.from(process.env.APP_PASSWORD).toString('base64');

  if (token === expected) return NextResponse.next();

  // Redirect to login, preserving the intended destination
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
