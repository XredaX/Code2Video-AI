import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getProjectHistory, getProjectCode, getProjectDir, renameProject, deleteProject } from '@/lib/projectManager';
import { assertUUID } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { metadataLockKey, projectLockKey, withProjectLock } from '@/lib/project-lock';

async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  return assertUUID(cookieStore.get('sid')?.value, 'session');
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const sid = await getSessionId();
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const history = getProjectHistory(sid, projectId);
    const code = getProjectCode(sid, projectId);
    const videoPath = path.join(process.cwd(), 'projects', sid, projectId, 'output.mp4');
    const hasVideo = fs.existsSync(videoPath);

    return NextResponse.json({
      history,
      code,
      videoUrl: hasVideo ? `/api/video/${projectId}` : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const sid = await getSessionId();
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');

    const { name } = await req.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const updated = await withProjectLock(metadataLockKey(sid), async () =>
      renameProject(sid, projectId, name.trim()),
    );
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const sid = await getSessionId();
    const { projectId } = await params;
    assertUUID(projectId, 'projectId');
    getProjectDir(sid, projectId);

    const ok = await withProjectLock(projectLockKey(sid, projectId), async () =>
      withProjectLock(metadataLockKey(sid), async () => deleteProject(sid, projectId)),
    );
    if (!ok) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
