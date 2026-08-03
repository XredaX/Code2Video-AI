/**
 * Extract compositionConfig from a TSX file
 *
 * Based on pattern from remotion/scripts/composition-watcher.js
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInSeconds: 5,
};

/**
 * Extract compositionConfig from a TSX file using brace matching
 * @param {string} filePath - Absolute path to TSX file
 * @returns {Object} Configuration object
 */
function extractCompositionConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.tsx');

  // Find the compositionConfig declaration block
  const declMatch = content.match(
    /(?:const|let|var)\s+compositionConfig(?:\s*:\s*[^=]+)?\s*=/
  );

  if (!declMatch) {
    throw new Error(
      `No compositionConfig found in ${filename}.tsx\n` +
      'Your file must export a compositionConfig object.'
    );
  }

  // Find the '=' sign position and the first opening brace after it
  const equalsIndex = declMatch.index + declMatch[0].length - 1;
  const openBraceIndex = content.indexOf('{', equalsIndex);
  if (openBraceIndex === -1) {
    throw new Error(
      `No compositionConfig object definition found in ${filename}.tsx`
    );
  }

  // Find matching closing brace
  let braceCount = 1;
  let closeBraceIndex = -1;
  for (let i = openBraceIndex + 1; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        closeBraceIndex = i;
        break;
      }
    }
  }

  if (closeBraceIndex === -1) {
    throw new Error(
      `Unmatched opening brace in compositionConfig in ${filename}.tsx`
    );
  }

  const configStrFull = content.slice(openBraceIndex, closeBraceIndex + 1);

  // --- Safe regex-based extraction (no eval) ---
  // Security: eval() on AI-generated TSX is a code-injection risk (OWASP A03).
  // Instead, extract each field individually using targeted regex patterns.
  const id = extractString(configStrFull, 'id') || filename;
  const durationInSeconds = extractNumber(configStrFull, 'durationInSeconds') ?? DEFAULTS.durationInSeconds;
  const fps = extractNumber(configStrFull, 'fps') ?? DEFAULTS.fps;
  const width = extractNumber(configStrFull, 'width') ?? DEFAULTS.width;
  const height = extractNumber(configStrFull, 'height') ?? DEFAULTS.height;
  const defaultProps = extractObject(configStrFull, 'defaultProps') || {};

  validateCompositionConfig({ id, durationInSeconds, fps, width, height });
  return { id, durationInSeconds, fps, width, height, defaultProps };
}

function validateCompositionConfig({ id, durationInSeconds, fps, width, height }) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    throw new Error('compositionConfig.id must use only letters, numbers, dashes, and underscores');
  }
  if (!Number.isFinite(durationInSeconds) || durationInSeconds < 1 || durationInSeconds > 15) {
    throw new Error('compositionConfig.durationInSeconds must be between 1 and 15');
  }
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) {
    throw new Error('compositionConfig.fps must be an integer between 1 and 60');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 3840 || height > 3840) {
    throw new Error('compositionConfig dimensions must be integers between 64 and 3840');
  }
  if (width * height > 8_294_400) {
    throw new Error('compositionConfig cannot exceed 4K pixel count');
  }
}

/**
 * Extract a string value for a given key from the config block.
 * Matches: key: 'value', key: "value", key: `value`
 */
function extractString(configStr, key) {
  const pattern = new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
  const match = configStr.match(pattern);
  return match ? match[1] : null;
}

/**
 * Extract a numeric value for a given key from the config block.
 * Matches: key: 123, key: 12.5, key: 100 + 50 (simple arithmetic)
 */
function extractNumber(configStr, key) {
  // Try arithmetic expression first (e.g. 60 * 5, 3 + 2)
  const arithPattern = new RegExp(`${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*([*+\\-])\\s*(\\d+(?:\\.\\d+)?)`);
  const arithMatch = configStr.match(arithPattern);
  if (arithMatch) {
    const a = parseFloat(arithMatch[1]);
    const op = arithMatch[2];
    const b = parseFloat(arithMatch[3]);
    switch (op) {
      case '*': return a * b;
      case '+': return a + b;
      case '-': return a - b;
    }
  }
  // Fallback: plain number
  const plainPattern = new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`);
  const plainMatch = configStr.match(plainPattern);
  if (plainMatch) {
    const n = parseFloat(plainMatch[1]);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Safely extract a shallow object literal for a given key.
 * Only supports flat { key: value } objects with string/number values.
 * Returns null if extraction fails.
 */
function extractObject(configStr, key) {
  const keyIdx = configStr.indexOf(`${key}`);
  if (keyIdx === -1) return null;

  const colonIdx = configStr.indexOf(':', keyIdx + key.length);
  if (colonIdx === -1) return null;

  const braceIdx = configStr.indexOf('{', colonIdx);
  if (braceIdx === -1) return null;

  // Find matching closing brace
  let depth = 1;
  let end = -1;
  for (let i = braceIdx + 1; i < configStr.length; i++) {
    if (configStr[i] === '{') depth++;
    else if (configStr[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  const inner = configStr.slice(braceIdx + 1, end).trim();
  if (!inner) return {};

  // Parse flat key-value pairs safely with regex
  const result = {};
  const entryPattern = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|(-?\d+(?:\.\d+)?))/g;
  let m;
  while ((m = entryPattern.exec(inner)) !== null) {
    const k = m[1];
    if (m[2] !== undefined) result[k] = m[2];
    else if (m[3] !== undefined) result[k] = m[3];
    else if (m[4] !== undefined) result[k] = m[4];
    else if (m[5] !== undefined) result[k] = parseFloat(m[5]);
  }
  return result;
}

/**
 * Detect the export style of a composition file
 * @param {string} filePath - Path to TSX file
 * @returns {Object} Export style info { type: 'default'|'named', name?: string }
 */
function detectExportStyle(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.tsx');

  // Check for default export
  if (/export\s+default/.test(content)) {
    return { type: 'default', name: null };
  }

  // Check for named exports that look like React components (PascalCase)
  const namedExportMatches = content.matchAll(
    /export\s+(?:const|function)\s+([A-Z][a-zA-Z0-9]*)/g
  );

  for (const match of namedExportMatches) {
    const name = match[1];
    if (name !== 'compositionConfig') {
      return { type: 'named', name };
    }
  }

  // Fallback to filename-based component name
  return { type: 'named', name: filename };
}

module.exports = {
  extractCompositionConfig,
  detectExportStyle,
};
