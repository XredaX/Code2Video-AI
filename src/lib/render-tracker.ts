/**
 * Render Process Tracker
 *
 * Tracks active render child processes so they can be cancelled by the user.
 * Each process is keyed by a composite string (typically `sid:projectId`).
 */

import { type ChildProcess, execFile as _execFile } from 'child_process';

interface TrackedRender {
  process: ChildProcess;
  cancel?: () => void;
}

const activeRenders = new Map<string, TrackedRender>();

/** Build a tracker key from session + project. */
export function renderKey(sid: string, projectId: string): string {
  return `${sid}:${projectId}`;
}

/** Register a child process for a given key. Returns the process for chaining. */
export function trackProcess(key: string, proc: ChildProcess, cancel?: () => void): ChildProcess {
  // Kill any existing render for this key first
  killProcess(key);
  activeRenders.set(key, { process: proc, cancel });

  // Auto-cleanup when the process exits
  proc.once('exit', () => {
    if (activeRenders.get(key)?.process === proc) {
      activeRenders.delete(key);
    }
  });

  return proc;
}

/** Kill an active render process (and its entire tree on Windows). */
export function killProcess(key: string): boolean {
  const tracked = activeRenders.get(key);
  if (!tracked) return false;

  activeRenders.delete(key);

  try { tracked.cancel?.(); } catch { /* best-effort external cleanup */ }

  const proc = tracked.process;

  if (proc.pid == null) return false;

  try {
    if (process.platform === 'win32') {
      // Kill entire process tree on Windows (render-cli.js → Remotion server → browser)
      _execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    // Process may have already exited
    try { proc.kill('SIGKILL'); } catch { /* already dead */ }
  }

  return true;
}

/** Check if a render is currently active for a given key. */
export function isRenderActive(key: string): boolean {
  return activeRenders.has(key);
}

/**
 * Run a child process and track it under the given key.
 * Returns a promise that resolves/rejects like execFileAsync,
 * but the process can be killed via killProcess(key) while running.
 */
export function execTracked(
  key: string,
  command: string,
  args: string[],
  options: { timeout?: number; cancel?: () => void } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = _execFile(command, args, {
      timeout: options.timeout,
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed || err.signal) {
          try { options.cancel?.(); } catch { /* best-effort external cleanup */ }
        }
        reject(Object.assign(err, { stdout, stderr }));
      } else {
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    });
    trackProcess(key, child, options.cancel);
  });
}
