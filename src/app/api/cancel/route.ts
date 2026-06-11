import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertUUID } from '@/lib/validate';
import { killProcess, renderKey, isRenderActive } from '@/lib/render-tracker';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');

    const { projectId } = await req.json();
    assertUUID(projectId, 'projectId');

    const rk = renderKey(sid, projectId);

    if (!isRenderActive(rk)) {
      return NextResponse.json({ cancelled: false, message: 'No active render found.' });
    }

    const killed = killProcess(rk);
    return NextResponse.json({ cancelled: killed });
  } catch (err: any) {
    console.error('Cancel API error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: err.status ?? 500 });
  }
}
