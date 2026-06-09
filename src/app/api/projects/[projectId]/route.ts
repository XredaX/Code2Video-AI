import { NextResponse } from 'next/server';
import { getProjectHistory, getProjectCode } from '@/lib/projectManager';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const { projectId } = await params;
  
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  try {
    const history = getProjectHistory(projectId);
    const code = getProjectCode(projectId);
    const videoPath = path.join(process.cwd(), 'projects', projectId, 'output.mp4');
    const hasVideo = fs.existsSync(videoPath);

    return NextResponse.json({
      history,
      code,
      videoUrl: hasVideo ? `/api/video/${projectId}` : null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
