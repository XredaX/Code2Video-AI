import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertUUID, assertPositiveInt } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { renderKey } from '@/lib/render-tracker';
import { renderProject } from '@/lib/render-runner';

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('v');

    let videoPath = path.join(process.cwd(), 'projects', sid, projectId, 'output.mp4');

    if (versionParam !== null) {
      const version = assertPositiveInt(versionParam, 'version');
      const versionedPath = path.join(process.cwd(), 'projects', sid, projectId, `output_v${version}.mp4`);

      if (!fs.existsSync(versionedPath)) {
        const historyPath = path.join(process.cwd(), 'projects', sid, projectId, 'history.json');
        if (fs.existsSync(historyPath)) {
          try {
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
            const modelMessages = history.filter((m: any) => m.role === 'model');
            const versionIdx = version - 1;
            const msg = modelMessages[versionIdx];
            if (msg) {
              const tsxMatch = msg.content.match(/```tsx\s*([\s\S]*?)\s*```/);
              if (tsxMatch?.[1]) {
                const codeToCompile = tsxMatch[1];
                const tempInputPath = path.join(process.cwd(), 'projects', sid, projectId, `video_v${version}.tsx`);
                fs.writeFileSync(tempInputPath, codeToCompile);

                try {
                  const rk = renderKey(sid, projectId);
                  await renderProject({ key: rk, inputPath: tempInputPath, outputPath: versionedPath });
                } finally {
                  // Always clean up temp file
                  try { fs.unlinkSync(tempInputPath); } catch (_) {}
                }
              }
            }
          } catch (compileError) {
            console.error(`On-demand compile failed for version ${version}:`, compileError);
          }
        }
      }

      if (fs.existsSync(versionedPath)) {
        videoPath = versionedPath;
      }
    }

    if (!fs.existsSync(videoPath)) {
      return new NextResponse('Video not found', { status: 404 });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      return new NextResponse(Readable.toWeb(file) as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunksize),
          'Content-Type': 'video/mp4',
        },
      });
    }

    const file = fs.createReadStream(videoPath);
    return new NextResponse(Readable.toWeb(file) as any, {
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': 'video/mp4',
      },
    });
  } catch (err: any) {
    console.error('Error serving video:', err);
    return new NextResponse(err.message || 'Internal Server Error', { status: err.status ?? 500 });
  }
}
