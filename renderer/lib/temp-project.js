/**
 * Create and manage temporary Remotion project for rendering
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectExportStyle } = require('./config-extractor');

const MAX_PUBLIC_ASSET_BYTES = 50 * 1024 * 1024;
const ALLOWED_PUBLIC_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.json',
]);

function copyPublicAssets(projectDir, tempDir) {
  const publicDir = path.join(tempDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  let copiedBytes = 0;

  const copyDirectory = (sourceDir, relativeDir) => {
    if (!fs.existsSync(sourceDir)) return;
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const source = path.join(sourceDir, entry.name);
      const relative = path.join(relativeDir, entry.name);
      const destination = path.join(publicDir, relative);
      const stats = fs.lstatSync(source);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        copyDirectory(source, relative);
        continue;
      }
      if (!stats.isFile() || !ALLOWED_PUBLIC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      copiedBytes += stats.size;
      if (copiedBytes > MAX_PUBLIC_ASSET_BYTES) throw new Error('Project render assets exceed 50 MB.');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
  };

  for (const directory of ['assets', 'attachments']) {
    copyDirectory(path.join(projectDir, directory), directory);
  }
}

/**
 * Create a temporary Remotion project that imports the user's TSX file
 * @param {string} tsxFilePath - Absolute path to user's TSX file
 * @param {Object} config - Extracted composition config
 * @returns {string} Path to temporary project directory
 */
function createTempProject(tsxFilePath, config) {
  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `remotion-render-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  copyPublicAssets(path.dirname(tsxFilePath), tempDir);

  // Detect export style of user's TSX
  const exportStyle = detectExportStyle(tsxFilePath);

  // Convert Windows path to forward slashes for ES module import
  const tsxFileUrl = tsxFilePath.replace(/\\/g, '/');

  // Generate import statement based on export style
  let importStatement;
  const componentName = `UserComponent`;

  if (exportStyle.type === 'default') {
    importStatement = `import ${componentName} from '${tsxFileUrl}';`;
  } else {
    importStatement = `import { ${exportStyle.name} as ${componentName} } from '${tsxFileUrl}';`;
  }

  // Calculate duration in frames
  const durationInFrames = Math.round(config.durationInSeconds * config.fps);

  // Create index.ts (entry point)
  const indexTs = `import { registerRoot } from 'remotion';
import { Root } from './Root';

registerRoot(Root);
`;
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTs);

  // Create Root.tsx (single composition loader)
  const rootTsx = `import React from 'react';
import { Composition } from 'remotion';
${importStatement}

export const Root: React.FC = () => {
  return (
    <Composition
      id="${config.id}"
      component={${componentName}}
      durationInFrames={${durationInFrames}}
      fps={${config.fps}}
      width={${config.width}}
      height={${config.height}}
      defaultProps={${JSON.stringify(config.defaultProps || {})}}
    />
  );
};
`;
  fs.writeFileSync(path.join(srcDir, 'Root.tsx'), rootTsx);

  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020', 'DOM'],
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      moduleResolution: 'node',
    },
    include: ['src/**/*'],
  };
  fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  // Create remotion.config.ts
  const remotionConfig = `import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
`;
  fs.writeFileSync(path.join(tempDir, 'remotion.config.ts'), remotionConfig);

  return tempDir;
}

/**
 * Clean up temporary project directory
 * @param {string} tempDir - Path to temporary directory
 */
function cleanupTempProject(tempDir) {
  if (tempDir && fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (file locks)
    }
  }
}

module.exports = {
  createTempProject,
  cleanupTempProject,
};
