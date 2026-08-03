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

const MAX_CODE_LENGTH = 500_000;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const { code } = await req.json();
    if (typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }
    if (code.length > MAX_CODE_LENGTH) {
      return NextResponse.json({ error: 'Code is too large.' }, { status: 413 });
    }

    const projectDir = getProjectDir(sid, projectId);
    const lockKey = projectLockKey(sid, projectId);

    return await withProjectLock(lockKey, async () => {
      const history = getProjectHistory(sid, projectId);
      const newVersion = history.filter((message) => message.role === 'model' && (message.code || /```tsx\s*[\s\S]*?```/.test(message.content))).length + 1;
      const renderId = randomUUID();
      const stagedInputPath = path.join(projectDir, `.render-${renderId}.tsx`);
      const stagedOutputPath = path.join(projectDir, `.render-${renderId}.mp4`);
      const versionedOutputPath = path.join(projectDir, `output_v${newVersion}.mp4`);

      try {
        writeFileAtomic(stagedInputPath, code);
        await renderProject({
          key: renderKey(sid, projectId),
          inputPath: stagedInputPath,
          outputPath: stagedOutputPath,
        });

        copyFileAtomic(stagedOutputPath, versionedOutputPath);
        copyFileAtomic(stagedOutputPath, path.join(projectDir, 'output.mp4'));
        saveProjectCode(sid, projectId, code);

        history.push(
          { role: 'user', content: 'Manually edited video code in studio editor.' },
          { role: 'model', content: 'Manual edit saved and rendered successfully.', code },
        );
        saveProjectHistory(sid, projectId, history);

        return NextResponse.json({
          success: true,
          code,
          videoUrl: `/api/video/${projectId}`,
          history,
        });
      } catch (renderError: any) {
        const wasCancelled = renderError.killed || renderError.signal === 'SIGTERM' || renderError.signal === 'SIGKILL';
        if (wasCancelled) {
          return NextResponse.json({ error: 'Render cancelled by user.' }, { status: 499 });
        }
        console.error('Manual edit render failed:', renderError);
        return NextResponse.json({
          error: 'Compilation or rendering failed',
          details: renderError.stderr || renderError.stdout || renderError.message,
          code,
        }, { status: 500 });
      } finally {
        try { fs.unlinkSync(stagedInputPath); } catch {}
        try { fs.unlinkSync(stagedOutputPath); } catch {}
      }
    });
  } catch (error: any) {
    console.error('API Project Editor Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status ?? 500 });
  }
}
