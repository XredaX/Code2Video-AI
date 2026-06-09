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
 * Extract compositionConfig from a TSX file using regex
 * @param {string} filePath - Absolute path to TSX file
 * @returns {Object} Configuration object
 */
function extractCompositionConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath, '.tsx');

  // Try to find compositionConfig export (same regex as composition-watcher.js)
  const configMatch = content.match(
    /export\s+const\s+compositionConfig\s*=\s*(\{[\s\S]*?\});/
  );

  if (!configMatch) {
    throw new Error(
      `No compositionConfig found in ${filename}.tsx\n` +
      'Your file must export a compositionConfig object.'
    );
  }

  try {
    // Clean up the config string for evaluation
    let configStr = configMatch[1]
      .replace(/\/\/.*$/gm, '')           // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
      .replace(/,(\s*[}\]])/g, '$1');     // Remove trailing commas

    // Simple evaluation for basic configs
    const config = eval(`(${configStr})`);

    // Validate and return with defaults
    return {
      id: config.id || filename,
      durationInSeconds: config.durationInSeconds || DEFAULTS.durationInSeconds,
      fps: config.fps || DEFAULTS.fps,
      width: config.width || DEFAULTS.width,
      height: config.height || DEFAULTS.height,
      defaultProps: config.defaultProps || {},
    };
  } catch (evalError) {
    // If eval fails, try to extract values with more specific regexes
    const configStr = configMatch[1];
    const id = extractValue(configStr, 'id') || filename;
    const durationInSeconds = parseFloat(extractValue(configStr, 'durationInSeconds')) || DEFAULTS.durationInSeconds;
    const fps = parseInt(extractValue(configStr, 'fps')) || DEFAULTS.fps;
    const width = parseInt(extractValue(configStr, 'width')) || DEFAULTS.width;
    const height = parseInt(extractValue(configStr, 'height')) || DEFAULTS.height;

    return { id, durationInSeconds, fps, width, height, defaultProps: {} };
  }
}

/**
 * Extract a specific value from a config string using regex
 */
function extractValue(configStr, key) {
  // Match patterns like: key: 'value', key: "value", key: 123
  const patterns = [
    new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`),  // String value
    new RegExp(`${key}\\s*:\\s*(\\d+\\.?\\d*)`),    // Numeric value
  ];

  for (const pattern of patterns) {
    const match = configStr.match(pattern);
    if (match) return match[1];
  }

  return null;
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
