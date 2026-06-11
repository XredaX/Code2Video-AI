import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir, getProjectCode } from '@/lib/projectManager';
import { assertUUID } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { execTracked, renderKey } from '@/lib/render-tracker';

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const cookieStore = await cookies();
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const history = getProjectHistory(sid, projectId);
    const body = await req.json().catch(() => ({}));
    let targetIndex = body.targetIndex;
    if (targetIndex === undefined) targetIndex = Math.max(0, history.length - 2);
    if (targetIndex < 0 || targetIndex > history.length) {
      return NextResponse.json({ error: 'Invalid targetIndex' }, { status: 400 });
    }

    const newHistory = history.slice(0, targetIndex);
    saveProjectHistory(sid, projectId, newHistory);

    // Clean up orphaned attachments
    const userMsgCount = newHistory.filter((m: any) => m.role === 'user').length;
    const attachmentsDir = path.join(getProjectDir(sid, projectId), 'attachments');
    if (fs.existsSync(attachmentsDir)) {
      try {
        for (const file of fs.readdirSync(attachmentsDir)) {
          const match = file.match(/^turn_(\d+)\./);
          if (match && parseInt(match[1], 10) >= userMsgCount) {
            fs.unlinkSync(path.join(attachmentsDir, file));
          }
        }
      } catch (e) { console.error('Attachment cleanup error:', e); }
    }

    const projectDir = getProjectDir(sid, projectId);
    const inputPath = path.join(projectDir, 'video.tsx');
    const outputPath = path.join(projectDir, 'output.mp4');

    // Clean up orphaned versioned videos
    const assistantMsgCount = newHistory.filter((m: any) => m.role === 'model').length;
    try {
      for (const file of fs.readdirSync(projectDir)) {
        const match = file.match(/^output_v(\d+)\.mp4$/);
        if (match && parseInt(match[1], 10) > assistantMsgCount) {
          fs.unlinkSync(path.join(projectDir, file));
        }
      }
    } catch (e) { console.error('Video cleanup error:', e); }

    // Find last code block in remaining history
    let lastCodeBlock = '';
    for (let i = newHistory.length - 1; i >= 0; i--) {
      if (newHistory[i].role === 'model') {
        const tsxMatch = newHistory[i].content.match(/```tsx\s*([\s\S]*?)\s*```/);
        if (tsxMatch?.[1]) { lastCodeBlock = tsxMatch[1]; break; }
      }
    }

    if (lastCodeBlock) {
      saveProjectCode(sid, projectId, lastCodeBlock);
      const versionedOutputPath = path.join(projectDir, `output_v${assistantMsgCount}.mp4`);

      const portableNode = path.join(process.cwd(), 'node', 'node.exe');
      const nodeExe = fs.existsSync(portableNode) ? portableNode : 'node';
      const renderCliPath = path.join(process.cwd(), 'renderer', 'render-cli.js');

      try {
        const rk = renderKey(sid, projectId);
        await execTracked(rk, nodeExe, [
          renderCliPath,
          `--input=${inputPath}`,
          `--output=${versionedOutputPath}`,
        ], { timeout: 180_000 });
        fs.copyFileSync(versionedOutputPath, outputPath);
      } catch (renderError: any) {
        const wasCancelled = renderError.killed || renderError.signal === 'SIGTERM' || renderError.signal === 'SIGKILL';
        if (wasCancelled) {
          console.log('Rollback render cancelled by user for project:', projectId);
        } else {
          console.error('Rollback compile failed:', renderError.stderr || renderError.message);
        }
      }
    } else {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        for (const file of fs.readdirSync(projectDir)) {
          if (file.match(/^output_v\d+\.mp4$/)) fs.unlinkSync(path.join(projectDir, file));
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      history: newHistory,
      code: lastCodeBlock,
      videoUrl: lastCodeBlock && fs.existsSync(outputPath) ? `/api/video/${projectId}` : null,
    });
  } catch (err: any) {
    console.error('Rollback API error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: err.status ?? 500 });
  }
}
