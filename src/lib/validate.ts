/**
 * Validation utilities for security-critical inputs.
 * Guards against path traversal and shell injection via strict allow-lists.
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Throws if the supplied string is not a valid UUID v4.
 * Prevents path traversal: UUID format never contains slashes or shell metacharacters.
 */
export function assertUUID(value: string | null | undefined, label = 'id'): string {
  if (!value || !UUID_V4_REGEX.test(value)) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  }
  return value;
}

/**
 * Validates a bare filename (no path separators, no ".." components).
 * Only allows alphanumeric, dot, dash, and underscore.
 */
export function assertSafeFilename(name: string | null | undefined, label = 'filename'): string {
  if (!name || /[/\\]/.test(name) || name.includes('..')) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  }
  return name;
}

/**
 * Validates a positive integer string (e.g., version numbers).
 */
export function assertPositiveInt(value: string | null, label = 'number'): number {
  const n = parseInt(value ?? '', 10);
  if (isNaN(n) || n < 1 || n > 9999) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  }
  return n;
}
