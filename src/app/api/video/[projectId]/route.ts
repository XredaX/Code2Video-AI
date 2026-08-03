import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { assertUUID, assertPositiveInt } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { renderKey } from '@/lib/render-tracker';
import { renderProject } from '@/lib/render-runner';
import { randomUUID } from 'crypto';
import { copyFileAtomic, writeFileAtomic } from '@/lib/atomic-file';
import { withProjectLock, projectLockKey } from '@/lib/project-lock';
import { getProjectDir, getProjectHistory } from '@/lib/projectManager';

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const url = new URL(req.url);
    const versionParam = url.searchParams.get('v');

    const projectDir = getProjectDir(sid, projectId);
    let videoPath = path.join(projectDir, 'output.mp4');

    if (versionParam !== null) {
      const version = assertPositiveInt(versionParam, 'version');
      const versionedPath = path.join(projectDir, `output_v${version}.mp4`);

      if (!fs.existsSync(versionedPath)) {
        await withProjectLock(projectLockKey(sid, projectId), async () => {
          if (fs.existsSync(versionedPath)) return;
          const history = getProjectHistory(sid, projectId);
          try {
            const modelMessages = history.filter((message) => message.role === 'model' && (message.code || /```tsx\s*[\s\S]*?```/.test(message.content)));
            const msg = modelMessages[version - 1];
            if (msg) {
              const tsxMatch = msg.content.match(/```tsx\s*([\s\S]*?)\s*```/);
              const versionCode = msg.code || tsxMatch?.[1]?.trim();
              if (versionCode) {
                const renderId = randomUUID();
                const stagedInputPath = path.join(projectDir, `.render-${renderId}.tsx`);
                const stagedOutputPath = path.join(projectDir, `.render-${renderId}.mp4`);
                writeFileAtomic(stagedInputPath, versionCode);

                try {
                  await renderProject({
                    key: renderKey(sid, projectId),
                    inputPath: stagedInputPath,
                    outputPath: stagedOutputPath,
                  });
                  copyFileAtomic(stagedOutputPath, versionedPath);
                } finally {
                  try { fs.unlinkSync(stagedInputPath); } catch {}
                  try { fs.unlinkSync(stagedOutputPath); } catch {}
                }
              }
            }
          } catch (compileError) {
            console.error(`On-demand compile failed for version ${version}:`, compileError);
          }
        });
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
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      let start = 0;
      let end = fileSize - 1;
      if (!match || (!match[1] && !match[2]) || fileSize === 0) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
      }
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }
        start = Math.max(fileSize - suffixLength, 0);
      } else {
        start = Number(match[1]);
        if (match[2]) end = Number(match[2]);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
      }
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
