import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { writeFileAtomic, writeJsonAtomic } from '@/lib/atomic-file';

export interface Message {
  role: 'user' | 'model';
  content: string;
  image?: string;
  code?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

const ROOT_PROJECTS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'projects');

// ---------------------------------------------------------------------------
// Per-session paths
// ---------------------------------------------------------------------------

/** Returns the root directory for a given session, creating it if needed. */
function sessionDir(sessionId: string): string {
  const dir = path.join(ROOT_PROJECTS_DIR, sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function projectsJson(sessionId: string): string {
  return path.join(sessionDir(sessionId), 'projects.json');
}

function initStorage(sessionId: string): void {
  const jsonPath = projectsJson(sessionId);
  if (!fs.existsSync(jsonPath)) {
    writeJsonAtomic(jsonPath, []);
  }
}

// ---------------------------------------------------------------------------
// Public API (all functions require sessionId)
// ---------------------------------------------------------------------------

export const listProjects = (sessionId: string): ProjectMetadata[] => {
  initStorage(sessionId);
  return JSON.parse(fs.readFileSync(projectsJson(sessionId), 'utf-8'));
};

export const createProject = (sessionId: string, name: string): ProjectMetadata => {
  initStorage(sessionId);
  const projects = listProjects(sessionId);
  const newProject: ProjectMetadata = {
    id: uuidv4(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  projects.push(newProject);
  writeJsonAtomic(projectsJson(sessionId), projects);

  const projectDir = path.join(sessionDir(sessionId), newProject.id);
  fs.mkdirSync(projectDir, { recursive: true });
  writeJsonAtomic(path.join(projectDir, 'history.json'), []);

  return newProject;
};

export const getProjectHistory = (sessionId: string, projectId: string): Message[] => {
  const historyPath = path.join(getProjectDir(sessionId, projectId), 'history.json');
  if (!fs.existsSync(historyPath)) return [];
  return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
};

export const saveProjectHistory = (sessionId: string, projectId: string, history: Message[]): void => {
  const historyPath = path.join(getProjectDir(sessionId, projectId), 'history.json');
  writeJsonAtomic(historyPath, history);

  // Update timestamp in metadata
  const projects = listProjects(sessionId);
  const proj = projects.find(p => p.id === projectId);
  if (proj) {
    proj.updatedAt = Date.now();
    writeJsonAtomic(projectsJson(sessionId), projects);
  }
};

export const getProjectCode = (sessionId: string, projectId: string): string => {
  const codePath = path.join(getProjectDir(sessionId, projectId), 'video.tsx');
  if (!fs.existsSync(codePath)) return '';
  return fs.readFileSync(codePath, 'utf-8');
};

export const saveProjectCode = (sessionId: string, projectId: string, code: string): void => {
  const codePath = path.join(getProjectDir(sessionId, projectId), 'video.tsx');
  writeFileAtomic(codePath, code);
};

export const getProjectDir = (sessionId: string, projectId: string): string => {
  const dir = path.join(sessionDir(sessionId), projectId);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }
  return dir;
};

export const renameProject = (sessionId: string, projectId: string, newName: string): ProjectMetadata | null => {
  const projects = listProjects(sessionId);
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return null;
  proj.name = newName.slice(0, 200); // enforce max length
  proj.updatedAt = Date.now();
  writeJsonAtomic(projectsJson(sessionId), projects);
  return proj;
};

export const deleteProject = (sessionId: string, projectId: string): boolean => {
  const projects = listProjects(sessionId);
  const idx = projects.findIndex(p => p.id === projectId);
  if (idx === -1) return false;
  projects.splice(idx, 1);
  writeJsonAtomic(projectsJson(sessionId), projects);

  const projectDir = path.join(sessionDir(sessionId), projectId);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
  return true;
};
