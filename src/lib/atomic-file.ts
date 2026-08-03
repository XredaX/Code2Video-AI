import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

function temporarySibling(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
}

export function writeFileAtomic(targetPath: string, data: string | Buffer): void {
  const temporaryPath = temporarySibling(targetPath);
  try {
    fs.writeFileSync(temporaryPath, data);
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch { /* already promoted */ }
  }
}

export function writeJsonAtomic(targetPath: string, value: unknown): void {
  writeFileAtomic(targetPath, JSON.stringify(value, null, 2));
}

export function copyFileAtomic(sourcePath: string, targetPath: string): void {
  const temporaryPath = temporarySibling(targetPath);
  try {
    fs.copyFileSync(sourcePath, temporaryPath);
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch { /* already promoted */ }
  }
}
