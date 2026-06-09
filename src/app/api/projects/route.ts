import { NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/projectManager';

export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json(projects);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const newProject = createProject(name);
    return NextResponse.json(newProject);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
