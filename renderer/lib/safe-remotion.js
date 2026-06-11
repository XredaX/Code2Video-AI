import * as remotion from '../node_modules/remotion/dist/esm/index.mjs';

function safeNormalizeColor(color) {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    // If it's a 3 or 6 digit hex number without the '#' prefix, prepend it
    if (/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return '#' + trimmed;
    }
  }
  return color;
}

const safeInterpolateColors = (frame, inputRange, outputRange, options) => {
  if (Array.isArray(outputRange)) {
    const safeOutputRange = outputRange.map(safeNormalizeColor);
    return remotion.interpolateColors(frame, inputRange, safeOutputRange, options);
  }
  return remotion.interpolateColors(frame, inputRange, outputRange, options);
};

// Re-export everything from the real ESM module
export * from '../node_modules/remotion/dist/esm/index.mjs';

// Export our wrapped version of interpolateColors
export { safeInterpolateColors as interpolateColors };
