import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir } from '@/lib/projectManager';
import { assertUUID } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { renderKey } from '@/lib/render-tracker';
import { renderProject } from '@/lib/render-runner';

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    saveProjectCode(sid, projectId, code);

    const projectDir = getProjectDir(sid, projectId);
    const inputPath = path.join(projectDir, 'video.tsx');
    const history = getProjectHistory(sid, projectId);
    const prevVersionsCount = history.filter((m: any) => m.role === 'model').length;
    const newVersion = prevVersionsCount + 1;
    const versionedOutputPath = path.join(projectDir, `output_v${newVersion}.mp4`);

    try {
      const rk = renderKey(sid, projectId);
      await renderProject({ key: rk, inputPath, outputPath: versionedOutputPath });

      fs.copyFileSync(versionedOutputPath, path.join(projectDir, 'output.mp4'));
      const videoUrl = `/api/video/${projectId}`;

      const userMsg = { role: 'user' as const, content: 'Manually edited video code in studio editor.' };
      const modelMsg = { role: 'model' as const, content: `Manual edit saved and rendered successfully.\n\n\`\`\`tsx\n${code}\n\`\`\`` };
      history.push(userMsg);
      history.push(modelMsg);
      saveProjectHistory(sid, projectId, history);

      return NextResponse.json({ success: true, code, videoUrl, history });
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
    }
  } catch (error: any) {
    console.error('API Project Editor Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status ?? 500 });
  }
}
