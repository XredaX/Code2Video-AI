import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listProjects, createProject } from '@/lib/projectManager';
import { assertUUID } from '@/lib/validate';
import { metadataLockKey, withProjectLock } from '@/lib/project-lock';

async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value ?? '';
  return assertUUID(sid, 'session');
}

export async function GET() {
  try {
    const sid = await getSessionId();
    const projects = await withProjectLock(metadataLockKey(sid), async () => listProjects(sid));
    return NextResponse.json(projects);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: (err.status ?? 500) });
  }
}

export async function POST(req: Request) {
  try {
    const sid = await getSessionId();
    const { name } = await req.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const newProject = await withProjectLock(metadataLockKey(sid), async () =>
      createProject(sid, name.trim().slice(0, 200)),
    );
    return NextResponse.json(newProject);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: (err.status ?? 500) });
  }
}
