import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { copyFileAtomic, writeFileAtomic } from '@/lib/atomic-file';
import { withProjectLock, projectLockKey } from '@/lib/project-lock';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir } from '@/lib/projectManager';
import { renderProject } from '@/lib/render-runner';
import { renderKey } from '@/lib/render-tracker';
import { assertUUID } from '@/lib/validate';

function cleanupFutureAssets(projectDir: string, userCount: number, assistantCount: number): void {
  const attachmentsDir = path.join(/* turbopackIgnore: true */ projectDir, 'attachments');
  if (fs.existsSync(attachmentsDir)) {
    for (const file of fs.readdirSync(attachmentsDir)) {
      const match = file.match(/^turn_(\d+)\./);
      if (match && Number(match[1]) >= userCount) {
        try { fs.unlinkSync(path.join(/* turbopackIgnore: true */ attachmentsDir, file)); } catch (error) {
          console.error('Attachment cleanup error:', error);
        }
      }
    }
  }

  for (const file of fs.readdirSync(projectDir)) {
    const match = file.match(/^output_v(\d+)\.mp4$/);
    if (match && Number(match[1]) > assistantCount) {
      try { fs.unlinkSync(path.join(/* turbopackIgnore: true */ projectDir, file)); } catch (error) {
        console.error('Video cleanup error:', error);
      }
    }
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const body = await req.json().catch(() => ({}));
    const requestedTarget = body.targetIndex;
    const projectDir = getProjectDir(sid, projectId);

    return await withProjectLock(projectLockKey(sid, projectId), async () => {
      const history = getProjectHistory(sid, projectId);
      const targetIndex = requestedTarget === undefined
        ? Math.max(0, history.length - 2)
        : requestedTarget;
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > history.length) {
        return NextResponse.json({ error: 'Invalid targetIndex' }, { status: 400 });
      }

      const newHistory = history.slice(0, targetIndex);
      const userCount = newHistory.filter((message: any) => message.role === 'user').length;
      const assistantCount = newHistory.filter((message: any) => message.role === 'model').length;
      let lastCodeBlock = '';
      for (let index = newHistory.length - 1; index >= 0; index--) {
        if (newHistory[index].role !== 'model') continue;
        const match = newHistory[index].content.match(/```tsx\s*([\s\S]*?)\s*```/);
        if (match?.[1]) {
          lastCodeBlock = match[1].trim();
          break;
        }
      }

      const outputPath = path.join(/* turbopackIgnore: true */ projectDir, 'output.mp4');
      if (!lastCodeBlock) {
        saveProjectHistory(sid, projectId, newHistory);
        for (const file of ['video.tsx', 'output.mp4']) {
          try { fs.unlinkSync(path.join(/* turbopackIgnore: true */ projectDir, file)); } catch {}
        }
        cleanupFutureAssets(projectDir, userCount, assistantCount);
        return NextResponse.json({ success: true, history: newHistory, code: '', videoUrl: null });
      }

      const renderId = randomUUID();
      const stagedInputPath = path.join(/* turbopackIgnore: true */ projectDir, `.render-${renderId}.tsx`);
      const stagedOutputPath = path.join(/* turbopackIgnore: true */ projectDir, `.render-${renderId}.mp4`);
      const versionedOutputPath = path.join(/* turbopackIgnore: true */ projectDir, `output_v${assistantCount}.mp4`);

      try {
        writeFileAtomic(stagedInputPath, lastCodeBlock);
        await renderProject({
          key: renderKey(sid, projectId),
          inputPath: stagedInputPath,
          outputPath: stagedOutputPath,
        });

        copyFileAtomic(stagedOutputPath, versionedOutputPath);
        copyFileAtomic(stagedOutputPath, outputPath);
        saveProjectCode(sid, projectId, lastCodeBlock);
        saveProjectHistory(sid, projectId, newHistory);
        cleanupFutureAssets(projectDir, userCount, assistantCount);

        return NextResponse.json({
          success: true,
          history: newHistory,
          code: lastCodeBlock,
          videoUrl: `/api/video/${projectId}`,
        });
      } catch (renderError: any) {
        const wasCancelled = renderError.killed || renderError.signal === 'SIGTERM' || renderError.signal === 'SIGKILL';
        if (wasCancelled) {
          return NextResponse.json({ error: 'Rollback render cancelled by user.' }, { status: 499 });
        }
        console.error('Rollback compile failed:', renderError.stderr || renderError.message);
        return NextResponse.json({
          error: 'Rollback rendering failed. Project was not changed.',
          details: renderError.stderr || renderError.stdout || renderError.message,
        }, { status: 500 });
      } finally {
        try { fs.unlinkSync(stagedInputPath); } catch {}
        try { fs.unlinkSync(stagedOutputPath); } catch {}
      }
    });
  } catch (error: any) {
    console.error('Rollback API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status ?? 500 });
  }
}
