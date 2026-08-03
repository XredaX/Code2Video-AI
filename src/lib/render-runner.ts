import path from 'path';
import { randomUUID } from 'crypto';
import { execTracked } from '@/lib/render-tracker';

const DEFAULT_IMAGE = 'code2video-ai-renderer:4.0.503';
const RENDER_TIMEOUT_MS = 180_000;

export interface RenderRequest {
  key: string;
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  durationInSeconds?: number;
}

function assertProjectLocalPath(filePath: string, projectDir: string, extension: string): void {
  const resolved = path.resolve(filePath);
  const relative = path.relative(projectDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(resolved).toLowerCase() !== extension) {
    throw Object.assign(new Error('Invalid renderer path'), { status: 400 });
  }
}

function optionalArgs(request: RenderRequest, still = false): string[] {
  const args: string[] = [];
  if (still) args.push('--still=true');
  if (request.width !== undefined) args.push(`--width=${request.width}`);
  if (request.height !== undefined) args.push(`--height=${request.height}`);
  if (request.durationInSeconds !== undefined) args.push(`--durationInSeconds=${request.durationInSeconds}`);
  return args;
}

function rendererMode(): 'docker' | 'local' {
  const configured = process.env.RENDERER_MODE?.toLowerCase();
  if (!configured || configured === 'docker') return 'docker';
  if (configured === 'local' && process.env.NODE_ENV !== 'production') return 'local';
  throw new Error('RENDERER_MODE must be "docker". Local rendering is allowed only in development.');
}

async function renderInDocker(request: RenderRequest, projectDir: string, still = false): Promise<void> {
  const image = process.env.REMOTION_RENDERER_IMAGE || DEFAULT_IMAGE;
  const containerName = `aive-render-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const inputName = path.basename(request.inputPath);
  const outputName = path.basename(request.outputPath);

  const args = [
    'run', '--rm', '--init',
    '--name', containerName,
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '256',
    '--cpus', '2',
    '--memory', '2g',
    '--tmpfs', '/tmp:rw,nosuid,size=2g',
    '--tmpfs', '/app/node_modules/.cache:rw,nosuid,nodev,noexec,size=256m,mode=1777',
    '--mount', `type=bind,source=${projectDir},target=/input,readonly`,
    '--mount', `type=bind,source=${projectDir},target=/output`,
    image,
    `--input=/input/${inputName}`,
    `--output=/output/${outputName}`,
    ...optionalArgs(request, still),
  ];

  await execTracked(request.key, 'docker', args, {
    timeout: RENDER_TIMEOUT_MS,
    cancel: () => {
      void execTracked(`${request.key}:cleanup`, 'docker', ['kill', containerName], { timeout: 10_000 }).catch(() => undefined);
    },
  });
}

async function renderLocally(request: RenderRequest, still = false): Promise<void> {
  const renderCliPath = path.join(process.cwd(), 'renderer', 'render-cli.js');
  await execTracked(request.key, process.execPath, [
    renderCliPath,
    `--input=${request.inputPath}`,
    `--output=${request.outputPath}`,
    ...optionalArgs(request, still),
  ], { timeout: RENDER_TIMEOUT_MS });
}

async function render(request: RenderRequest, extension: '.mp4' | '.png', still: boolean): Promise<void> {
  const projectDir = path.resolve(path.dirname(request.inputPath));
  assertProjectLocalPath(request.inputPath, projectDir, '.tsx');
  assertProjectLocalPath(request.outputPath, projectDir, extension);

  if (rendererMode() === 'local') {
    await renderLocally(request, still);
    return;
  }

  await renderInDocker(request, projectDir, still);
}

export async function renderProject(request: RenderRequest): Promise<void> {
  await render(request, '.mp4', false);
}

export async function renderProjectStill(request: RenderRequest): Promise<void> {
  await render(request, '.png', true);
}
