import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; filename: string } }
) {
  const { projectId, filename } = await params;
  const filePath = path.join(process.cwd(), 'projects', projectId, 'attachments', filename);

  if (!fs.existsSync(filePath)) {
    return new Response('File not found', { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'image/jpeg';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.gif') contentType = 'image/gif';

  try {
    const fileBuffer = fs.readFileSync(filePath);
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
