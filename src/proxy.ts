import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const SID_COOKIE = 'sid';
const SID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackRequest(request: NextRequest): boolean {
  return LOOPBACK_HOSTS.has(request.nextUrl.hostname.toLowerCase());
}

export function proxy(request: NextRequest) {
  // This app executes generated Remotion code and is intentionally local-only.
  // Socket binding in package scripts is the primary boundary; this also blocks
  // accidental serverless/public deployments.
  if (!isLoopbackRequest(request)) {
    return NextResponse.json(
      { error: 'Remote access is disabled. Run this application on localhost.' },
      { status: 403 },
    );
  }

  const response = NextResponse.next();

  const existingSid = request.cookies.get(SID_COOKIE)?.value;

  // If there's already a valid UUID session ID, keep it
  if (existingSid && UUID_V4_REGEX.test(existingSid)) {
    return response;
  }

  // Generate a new session ID for this visitor
  const newSid = uuidv4();
  response.cookies.set(SID_COOKIE, newSid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SID_MAX_AGE,
    // Secure flag: enable in production (HTTPS), omit in dev (HTTP)
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};
