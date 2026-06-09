import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const { projectId } = await params;
  
  if (!projectId) {
    return new NextResponse('Missing projectId', { status: 400 });
  }

  const videoPath = path.join(process.cwd(), 'projects', projectId, 'output.mp4');

  if (!fs.existsSync(videoPath)) {
    return new NextResponse('Video not found', { status: 404 });
  }

  try {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      return new NextResponse(file as any, { status: 206, headers: head });
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      const file = fs.createReadStream(videoPath);
      return new NextResponse(file as any, { headers: head });
    }
  } catch (err) {
    console.error('Error serving video:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
