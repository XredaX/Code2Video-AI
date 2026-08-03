import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { probeMcpConnection } from '@/lib/mcp-client';
import { getMcpConnection } from '@/lib/mcp-store';
import { assertUUID } from '@/lib/validate';

export async function POST(_request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const sid = assertUUID((await cookies()).get('sid')?.value, 'session');
    const { connectionId: rawConnectionId } = await params;
    const connectionId = assertUUID(rawConnectionId, 'connectionId');
    const connection = getMcpConnection(sid, connectionId);
    const tools = await probeMcpConnection(connection);
    return NextResponse.json({ tools });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'MCP probe failed.' }, { status: error.status ?? 502 });
  }
}
