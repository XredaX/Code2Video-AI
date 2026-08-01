/**
 * Validation utilities for security-critical inputs.
 * Guards against path traversal and shell injection via strict allow-lists.
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GEMINI_MODEL_ID_REGEX = /^gemini-\d+\.\d+-(?:pro|flash|flash-lite|flash-8b)$/i;

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
  if (!value || !/^\d+$/.test(value)) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 9999) {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  }
  return n;
}

export function assertGeminiModelId(value: unknown): string {
  if (typeof value !== 'string' || !GEMINI_MODEL_ID_REGEX.test(value)) {
    throw Object.assign(new Error('Invalid Gemini model'), { status: 400 });
  }
  return value;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', matches: (data: Buffer) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (data: Buffer) => data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/gif': { extension: 'gif', matches: (data: Buffer) => data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')) },
} as const;

export interface ValidatedImageUpload {
  mimeType: keyof typeof IMAGE_TYPES;
  extension: string;
  data: string;
  buffer: Buffer;
}

export function validateImageUpload(value: unknown): ValidatedImageUpload | null {
  if (value == null) return null;
  if (typeof value !== 'object') {
    throw Object.assign(new Error('Invalid image upload'), { status: 400 });
  }

  const image = value as { mimeType?: unknown; data?: unknown };
  if (typeof image.mimeType !== 'string' || !(image.mimeType in IMAGE_TYPES)) {
    throw Object.assign(new Error('Unsupported image type'), { status: 415 });
  }
  if (typeof image.data !== 'string' || !image.data || image.data.length % 4 !== 0 || !BASE64_PATTERN.test(image.data)) {
    throw Object.assign(new Error('Invalid image data'), { status: 400 });
  }

  const buffer = Buffer.from(image.data, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('Image too large. Maximum size is 10 MB.'), { status: 413 });
  }

  const mimeType = image.mimeType as keyof typeof IMAGE_TYPES;
  const definition = IMAGE_TYPES[mimeType];
  if (!definition.matches(buffer)) {
    throw Object.assign(new Error('Image content does not match its declared type'), { status: 415 });
  }

  return {
    mimeType,
    extension: definition.extension,
    data: image.data,
    buffer,
  };
}
