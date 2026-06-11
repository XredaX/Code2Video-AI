/**
 * Per-project write serializer with file-based advisory locking.
 *
 * Two-layer design:
 *  1. **In-process FIFO queue** (Map<key, Promise>) — fast, zero I/O for
 *     concurrent requests within a single Node.js worker.
 *  2. **File-based advisory lock** — a `.lock` file per project directory,
 *     created atomically with `O_EXCL`, with retry-backoff and stale-lock
 *     detection.  Handles multi-worker / multi-process deployments.
 *
 * The lock file is written to `projects/{sessionId}/{projectId}/.lock` and
 * contains the PID + timestamp of the holder.  A lock older than
 * `STALE_LOCK_MS` is assumed orphaned and can be stolen.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LOCK_RETRY_MS = 100;       // initial retry interval
const LOCK_MAX_RETRIES = 50;     // give up after ~5 s of contention
const STALE_LOCK_MS = 60_000;    // lock older than 60 s is considered orphaned

// ---------------------------------------------------------------------------
// Layer 1 — In-process FIFO queue
// ---------------------------------------------------------------------------

const queue = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Layer 2 — File-based advisory lock
// ---------------------------------------------------------------------------

function lockFilePath(lockKey: string): string {
  // lockKey = "sessionId:projectId"
  const [sessionId, projectId] = lockKey.split(':');
  return path.join(process.cwd(), 'projects', sessionId, projectId, '.lock');
}

interface LockMeta {
  pid: number;
  ts: number;
}

function readLockMeta(fp: string): LockMeta | null {
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

function isStale(meta: LockMeta | null): boolean {
  if (!meta) return true;
  return Date.now() - meta.ts > STALE_LOCK_MS;
}

/**
 * Acquire the file-based lock.  Retries with linear back-off.
 * Steals the lock if it is stale (process crashed / was killed).
 */
async function acquireFileLock(fp: string): Promise<void> {
  const meta: LockMeta = { pid: process.pid, ts: Date.now() };
  const payload = JSON.stringify(meta);

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      // O_EXCL makes this atomic — only one process wins
      fs.writeFileSync(fp, payload, { flag: 'wx' });
      return; // acquired
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;

      // Lock exists — check if it's stale
      const existing = readLockMeta(fp);
      if (isStale(existing)) {
        // Orphaned lock: remove and retry immediately
        try { fs.unlinkSync(fp); } catch { /* race: other process already cleaned */ }
        continue;
      }

      // Still held — wait with linear back-off
      const waitMs = LOCK_RETRY_MS + attempt * 20;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw new Error(
    `Could not acquire project lock after ${LOCK_MAX_RETRIES} attempts: ${fp}`
  );
}

function releaseFileLock(fp: string): void {
  try {
    // Only delete if we still own the lock (PID matches)
    const meta = readLockMeta(fp);
    if (meta && meta.pid === process.pid) {
      fs.unlinkSync(fp);
    }
  } catch {
    // Ignore cleanup errors (file may already be gone on Windows)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run `fn` exclusively for the given `lockKey`.
 *
 * Concurrent calls with the same key are serialized in FIFO order within
 * the process, and protected by an advisory file lock across processes.
 */
export async function withProjectLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  // Layer 1: wait for previous in-process operation
  const prev = queue.get(lockKey) ?? Promise.resolve();

  let releaseQueue!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  // Register our slot — subsequent callers will wait on `current`
  queue.set(lockKey, current);

  const fp = lockFilePath(lockKey);

  try {
    await prev;

    // Layer 2: acquire cross-process file lock
    await acquireFileLock(fp);

    try {
      return await fn();
    } finally {
      releaseFileLock(fp);
    }
  } finally {
    releaseQueue();
    // Clean up the map entry only if we're still the most recent operation
    if (queue.get(lockKey) === current) {
      queue.delete(lockKey);
    }
  }
}

/** Convenience key builder: combines sessionId + projectId */
export function projectLockKey(sessionId: string, projectId: string): string {
  return `${sessionId}:${projectId}`;
}
