import { NextResponse } from 'next/server';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir, getProjectCode } from '@/lib/projectManager';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const { projectId } = await params;

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  try {
    const history = getProjectHistory(projectId);
    
    const body = await req.json().catch(() => ({}));
    let targetIndex = body.targetIndex;

    if (targetIndex === undefined) {
      targetIndex = Math.max(0, history.length - 2);
    }

    if (targetIndex < 0 || targetIndex > history.length) {
      return NextResponse.json({ error: 'Invalid targetIndex' }, { status: 400 });
    }

    const newHistory = history.slice(0, targetIndex);
    saveProjectHistory(projectId, newHistory);

    // Clean up orphaned attachments
    const userMsgCount = newHistory.filter((m: any) => m.role === 'user').length;
    const attachmentsDir = path.join(getProjectDir(projectId), 'attachments');
    if (fs.existsSync(attachmentsDir)) {
      try {
        const files = fs.readdirSync(attachmentsDir);
        for (const file of files) {
          const match = file.match(/^turn_(\d+)\./);
          if (match) {
            const k = parseInt(match[1], 10);
            if (k >= userMsgCount) {
              fs.unlinkSync(path.join(attachmentsDir, file));
            }
          }
        }
      } catch (e) {
        console.error('Failed to clean up attachments on rollback:', e);
      }
    }

    const projectDir = getProjectDir(projectId);
    const inputPath = path.join(projectDir, 'video.tsx');
    const outputPath = path.join(projectDir, 'output.mp4');

    // Find the last remaining assistant message containing a code block
    let lastCodeBlock = '';
    for (let i = newHistory.length - 1; i >= 0; i--) {
      if (newHistory[i].role === 'model') {
        const tsxMatch = newHistory[i].content.match(/```tsx\s*([\s\S]*?)\s*```/);
        if (tsxMatch && tsxMatch[1]) {
          lastCodeBlock = tsxMatch[1];
          break;
        }
      }
    }

    if (lastCodeBlock) {
      // Restore the previous working code
      saveProjectCode(projectId, lastCodeBlock);
      
      // Re-compile the previous video state
      const portableNode = path.join(process.cwd(), 'node', 'node.exe');
      const nodeExe = fs.existsSync(portableNode) ? portableNode : 'node';
      const renderCliPath = path.join(process.cwd(), 'renderer', 'render-cli.js');
      const command = `"${nodeExe}" "${renderCliPath}" --input="${inputPath}" --output="${outputPath}"`;

      try {
        await execAsync(command);
      } catch (renderError: any) {
        console.error('Rollback compile failed:', renderError.stderr || renderError.stdout || renderError.message);
      }
    } else {
      // If no code remains in history, clean up files
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      history: newHistory,
      code: lastCodeBlock,
      videoUrl: lastCodeBlock && fs.existsSync(outputPath) ? `/api/video/${projectId}` : null
    });

  } catch (err: any) {
    console.error('Rollback API error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
