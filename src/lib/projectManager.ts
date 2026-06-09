import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const PROJECTS_JSON = path.join(PROJECTS_DIR, 'projects.json');

// Ensure the projects directory and metadata file exist
const initStorage = () => {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_JSON)) {
    fs.writeFileSync(PROJECTS_JSON, JSON.stringify([]));
  }
};

export const listProjects = (): ProjectMetadata[] => {
  initStorage();
  const data = fs.readFileSync(PROJECTS_JSON, 'utf-8');
  return JSON.parse(data);
};

export const createProject = (name: string): ProjectMetadata => {
  initStorage();
  const projects = listProjects();
  const newProject: ProjectMetadata = {
    id: uuidv4(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  projects.push(newProject);
  fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2));

  // Create project directory
  const projectDir = path.join(PROJECTS_DIR, newProject.id);
  fs.mkdirSync(projectDir, { recursive: true });

  // Initialize history
  fs.writeFileSync(path.join(projectDir, 'history.json'), JSON.stringify([]));
  
  return newProject;
};

export const getProjectHistory = (projectId: string): Message[] => {
  const historyPath = path.join(PROJECTS_DIR, projectId, 'history.json');
  if (!fs.existsSync(historyPath)) return [];
  return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
};

export const saveProjectHistory = (projectId: string, history: Message[]) => {
  const historyPath = path.join(PROJECTS_DIR, projectId, 'history.json');
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  
  // Update timestamp
  const projects = listProjects();
  const proj = projects.find(p => p.id === projectId);
  if (proj) {
    proj.updatedAt = Date.now();
    fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2));
  }
};

export const getProjectCode = (projectId: string): string => {
  const codePath = path.join(PROJECTS_DIR, projectId, 'video.tsx');
  if (!fs.existsSync(codePath)) return '';
  return fs.readFileSync(codePath, 'utf-8');
};

export const saveProjectCode = (projectId: string, code: string) => {
  const codePath = path.join(PROJECTS_DIR, projectId, 'video.tsx');
  fs.writeFileSync(codePath, code);
};

export const getProjectDir = (projectId: string): string => {
  return path.join(PROJECTS_DIR, projectId);
};
