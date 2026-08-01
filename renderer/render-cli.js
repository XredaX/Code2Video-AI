/**
 * Remotion CLI Renderer
 *
 * Renders a standalone TSX composition file to MP4.
 *
 * Usage:
 *   node render-cli.js --input=path/to/file.tsx [--output=path/to/output.mp4]
 */

const path = require('path');
const fs = require('fs');
const net = require('net');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition, ensureBrowser } = require('@remotion/renderer');

const { extractCompositionConfig } = require('./lib/config-extractor');
const { createTempProject, cleanupTempProject } = require('./lib/temp-project');
const { validateTsxFile } = require('./lib/validators');
const { banner, log, error, success, progress, clearProgress } = require('./lib/console');

// Parse command line arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        // Remove surrounding quotes if present
        args[key] = value.replace(/^["']|["']$/g, '');
      } else {
        args[arg.slice(2)] = true;
      }
    } else if (!args._positional) {
      args._positional = [arg];
    } else {
      args._positional.push(arg);
    }
  });
  return args;
}

// Find an available port by asking the OS to assign one (port 0),
// then releasing it. This avoids conflicts with Next.js dev server on 3000.
function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Generate unique output filename
function generateOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, '.tsx');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(dir, `${baseName}_${timestamp}.mp4`);
}

async function main() {
  banner('Remotion Video Renderer');

  const args = parseArgs();
  const inputPath = args.input || (args._positional && args._positional[0]);

  if (!inputPath) {
    error('No input file specified');
    console.log('');
    console.log('  Usage: render-cli.js --input=file.tsx [--output=output.mp4]');
    console.log('');
    process.exit(1);
  }

  // Resolve to absolute path
  const absoluteInputPath = path.resolve(inputPath);

  // Validate input file
  try {
    validateTsxFile(absoluteInputPath);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  // Determine output path
  const outputPath = args.output
    ? path.resolve(args.output)
    : generateOutputPath(absoluteInputPath);

  log('Input', absoluteInputPath);
  log('Output', outputPath);
  console.log('');

  // Extract composition config from TSX file
  log('Extracting composition config...');
  let config;
  try {
    config = extractCompositionConfig(absoluteInputPath);
    log('Composition ID', config.id);
    log('Duration', `${config.durationInSeconds}s at ${config.fps}fps`);
    log('Resolution', `${config.width}x${config.height}`);
  } catch (err) {
    error(`Failed to extract composition config: ${err.message}`);
    console.log('');
    console.log('  Hint: Ensure your TSX file exports a compositionConfig object:');
    console.log('');
    console.log('    export const compositionConfig = {');
    console.log("      id: 'MyVideo',");
    console.log('      durationInSeconds: 5,');
    console.log('      fps: 30,');
    console.log('      width: 1080,');
    console.log('      height: 1920,');
    console.log('    };');
    console.log('');
    process.exit(1);
  }

  let tempProjectDir = null;

  try {
    // Ensure browser is available
    console.log('');
    log('Checking browser...');
    await ensureBrowser({
      logLevel: 'error',
      onBrowserDownload: () => {
        return {
          version: null,
          onProgress: ({ percent }) => {
            progress(`Downloading browser: ${Math.round(percent * 100)}%`);
          },
        };
      },
    });
    clearProgress();
    success('Browser ready');

    // Create temporary project with user's TSX file
    log('Creating temporary project...');
    tempProjectDir = createTempProject(absoluteInputPath, config);
    success('Temporary project created');

    // Bundle the project
    log('Bundling project...');
    const entryPoint = path.join(tempProjectDir, 'src', 'index.ts');

    // Get the renderer's node_modules path for dependency resolution
    const rendererNodeModules = path.resolve(__dirname, 'node_modules');

    const bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (webpackConfig) => {
        // Add renderer's node_modules to module resolution paths
        // This allows TSX files to use dependencies installed in the renderer
        webpackConfig.resolve = webpackConfig.resolve || {};
        webpackConfig.resolve.modules = [
          'node_modules',
          ...(webpackConfig.resolve.modules || []).filter(m => m !== 'node_modules'),
          rendererNodeModules,
        ];

        // Alias remotion to use our safe wrapper
        webpackConfig.resolve.alias = webpackConfig.resolve.alias || {};
        delete webpackConfig.resolve.alias['remotion'];
        webpackConfig.resolve.alias['remotion$'] = path.resolve(__dirname, 'lib/safe-remotion.js');

        // Also add to loader resolution
        webpackConfig.resolveLoader = webpackConfig.resolveLoader || {};
        webpackConfig.resolveLoader.modules = [
          ...(webpackConfig.resolveLoader.modules || ['node_modules']),
          rendererNodeModules,
        ];

        return webpackConfig;
      },
      onProgress: (percent) => {
        progress(`Bundling: ${Math.round(percent * 100)}%`);
      },
    });
    clearProgress();
    success('Bundle complete');

    // Find an available port to avoid conflict with Next.js dev server (port 3000).
    // Remotion's default range is 3000-3100, which collides with the Next.js dev server.
    const selectPort = await findAvailablePort();
    log('Using port', String(selectPort));

    // Select composition
    log('Selecting composition...');
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: config.id,
      port: selectPort,
    });
    success(`Selected: ${composition.id}`);

    // Render the video
    const durationInFrames = Math.round(config.durationInSeconds * config.fps);
    console.log('');
    log('Rendering video...');
    console.log(`    ${durationInFrames} frames at ${config.fps}fps`);

    // Find a fresh port for renderMedia (selectComposition's server may not have
    // fully released its port yet)
    const renderPort = await findAvailablePort();

    await renderMedia({
      composition: {
        ...composition,
        durationInFrames,
        fps: config.fps,
        width: config.width,
        height: config.height,
      },
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      port: renderPort,
      chromiumOptions: {
        enableMultiProcessOnLinux: true,
      },
      onProgress: ({ progress: p }) => {
        progress(`Rendering: ${Math.round(p * 100)}%`);
      },
    });

    clearProgress();
    console.log('');
    success('Render complete!');
    console.log('');
    console.log(`  Output: ${outputPath}`);
    console.log('');

    process.exit(0);
  } catch (err) {
    clearProgress();
    error(`Render failed: ${err.message}`);

    // Provide helpful hints for common errors
    if (err.message.includes('compositionConfig')) {
      console.log('  Hint: Check that your compositionConfig is properly formatted');
    } else if (err.message.includes('Module not found')) {
      const moduleMatch = err.message.match(/Can't resolve '([^']+)'/);
      if (moduleMatch) {
        console.log(`  Hint: Module '${moduleMatch[1]}' is not installed in the renderer`);
      } else {
        console.log('  Hint: Your TSX file uses a dependency not included in the renderer');
      }
      console.log('');
      console.log('  Supported libraries:');
      console.log('    - react, remotion (core)');
      console.log('    - three, @react-three/fiber, @react-three/drei');
      console.log('    - @remotion/* packages (media-utils, noise, shapes, etc.)');
      console.log('    - framer-motion, d3, lodash, zod');
    } else if (err.message.includes('ENOENT')) {
      console.log('  Hint: A required file or directory was not found');
    }

    if (args.verbose) {
      console.log('');
      console.log('  Stack trace:');
      console.log(err.stack);
    }

    process.exit(1);
  } finally {
    // Cleanup temporary project
    if (tempProjectDir) {
      cleanupTempProject(tempProjectDir);
    }
  }
}

main();
