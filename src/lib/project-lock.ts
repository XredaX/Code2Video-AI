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
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const LOCK_RETRY_MS = 100;       // initial retry interval
const LOCK_WAIT_TIMEOUT_MS = 210_000;
const STALE_LOCK_MS = 300_000;
const LOCK_HEARTBEAT_MS = 30_000;
const METADATA_LOCK_ID = '__metadata__';

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
  const sessionPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'projects', sessionId);
  if (projectId === METADATA_LOCK_ID) {
    fs.mkdirSync(sessionPath, { recursive: true });
    return path.join(sessionPath, '.projects.lock');
  }
  return path.join(sessionPath, projectId, '.lock');
}

interface LockMeta {
  pid: number;
  ts: number;
  token: string;
}

function readLockMeta(fp: string): LockMeta | null {
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

function isStale(fp: string): boolean {
  try {
    return Date.now() - fs.statSync(fp).mtimeMs > STALE_LOCK_MS;
  } catch {
    return true;
  }
}

/**
 * Acquire the file-based lock.  Retries with linear back-off.
 * Steals the lock if it is stale (process crashed / was killed).
 */
async function acquireFileLock(fp: string): Promise<LockMeta> {
  const meta: LockMeta = { pid: process.pid, ts: Date.now(), token: randomUUID() };
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < LOCK_WAIT_TIMEOUT_MS) {
    try {
      // O_EXCL makes this atomic — only one process wins
      meta.ts = Date.now();
      fs.writeFileSync(fp, JSON.stringify(meta), { flag: 'wx' });
      return meta;
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;

      // Lock exists — check if it's stale
      if (isStale(fp)) {
        // Orphaned lock: remove and retry immediately
        try { fs.unlinkSync(fp); } catch { /* race: other process already cleaned */ }
        continue;
      }

      // Still held — wait with linear back-off
      const waitMs = LOCK_RETRY_MS + attempt * 20;
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
    }
  }

  throw new Error(
    `Could not acquire project lock within ${LOCK_WAIT_TIMEOUT_MS}ms: ${fp}`
  );
}

function releaseFileLock(fp: string, owner: LockMeta): void {
  try {
    // Only delete if we still own the lock (PID matches)
    const meta = readLockMeta(fp);
    if (meta && meta.pid === owner.pid && meta.token === owner.token) {
      fs.unlinkSync(fp);
    }
  } catch {
    // Ignore cleanup errors (file may already be gone on Windows)
  }
}

function refreshFileLock(fp: string, owner: LockMeta): void {
  try {
    const current = readLockMeta(fp);
    if (current && current.pid === owner.pid && current.token === owner.token) {
      const now = new Date();
      fs.utimesSync(fp, now, now);
    }
  } catch {
    // Next refresh or final ownership check will detect a lost lock.
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
    const owner = await acquireFileLock(fp);
    const heartbeat = setInterval(() => refreshFileLock(fp, owner), LOCK_HEARTBEAT_MS);
    heartbeat.unref();

    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
      releaseFileLock(fp, owner);
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

export function metadataLockKey(sessionId: string): string {
  return `${sessionId}:${METADATA_LOCK_ID}`;
}
