import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertUUID, assertSafeFilename } from '@/lib/validate';
import fs from 'fs';
import path from 'path';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; filename: string }> }
) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId, filename } = await params;
    assertUUID(projectId, 'projectId');
    assertSafeFilename(filename, 'filename');

    const filePath = path.join(process.cwd(), 'projects', sid, projectId, 'attachments', filename);
    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.gif') contentType = 'image/gif';

    const fileBuffer = fs.readFileSync(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
