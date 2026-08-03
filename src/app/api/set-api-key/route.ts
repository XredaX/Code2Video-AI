import { NextResponse } from 'next/server';

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const isProduction = process.env.NODE_ENV === 'production';

/**
 * POST /api/set-api-key  { key: string }
 * Saves the Gemini API key as an HttpOnly cookie scoped to /api paths only.
 * This means the browser never attaches it to page requests, reducing
 * the attack surface if a route ever leaks request headers.
 */
export async function POST(req: Request) {
  try {
    const { key } = await req.json();
    const cleanKey = typeof key === 'string' ? key.trim() : '';

    if (cleanKey.length > 512) {
      return NextResponse.json({ error: 'API key is too long' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true });

    if (cleanKey) {
      // Actual key: HttpOnly + scoped to /api only (never sent on page requests)
      response.cookies.set('gemini_api_key', cleanKey, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api',        // ← restricted: only sent to /api/* routes
        maxAge: MAX_AGE,
        secure: isProduction,
      });
      // UI signal: NOT HttpOnly (page.tsx reads it to show key status)
      // but we keep it scoped to '/' — it's just a boolean "1", no secret value
      response.cookies.set('has_api_key', '1', {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE,
        secure: isProduction,
      });
    } else {
      // Clear both — must use matching paths to successfully delete them
      response.cookies.set('gemini_api_key', '', { maxAge: 0, path: '/api' });
      response.cookies.set('has_api_key',    '', { maxAge: 0, path: '/' });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** DELETE /api/set-api-key — clears the stored API key */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('gemini_api_key', '', { maxAge: 0, path: '/api' });
  response.cookies.set('has_api_key',    '', { maxAge: 0, path: '/' });
  return response;
}
