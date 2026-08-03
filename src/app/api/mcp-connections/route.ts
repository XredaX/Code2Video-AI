import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listMcpConnections, publicMcpConnection, saveMcpConnection } from '@/lib/mcp-store';
import { metadataLockKey, withProjectLock } from '@/lib/project-lock';
import { assertUUID } from '@/lib/validate';

async function sessionId(): Promise<string> {
  return assertUUID((await cookies()).get('sid')?.value, 'session');
}

export async function GET() {
  try {
    const sid = await sessionId();
    return NextResponse.json({ connections: listMcpConnections(sid).map(publicMcpConnection) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sid = await sessionId();
    const input = await request.json();
    const connection = await withProjectLock(metadataLockKey(sid), async () => saveMcpConnection(sid, input));
    return NextResponse.json({ connection: publicMcpConnection(connection) }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}
