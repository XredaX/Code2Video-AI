import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteMcpConnection, publicMcpConnection, saveMcpConnection } from '@/lib/mcp-store';
import { metadataLockKey, withProjectLock } from '@/lib/project-lock';
import { assertUUID } from '@/lib/validate';

async function context(params: Promise<{ connectionId: string }>) {
  const sid = assertUUID((await cookies()).get('sid')?.value, 'session');
  const { connectionId } = await params;
  return { sid, connectionId: assertUUID(connectionId, 'connectionId') };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { sid, connectionId } = await context(params);
    const input = await request.json();
    const connection = await withProjectLock(metadataLockKey(sid), async () =>
      saveMcpConnection(sid, input, connectionId),
    );
    return NextResponse.json({ connection: publicMcpConnection(connection) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { sid, connectionId } = await context(params);
    const deleted = await withProjectLock(metadataLockKey(sid), async () => deleteMcpConnection(sid, connectionId));
    if (!deleted) return NextResponse.json({ error: 'MCP connection not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
  }
}
