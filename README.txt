================================================================================
                         REMOTION VIDEO RENDERER
================================================================================

Render AI-generated TSX composition files to MP4 videos.

--------------------------------------------------------------------------------
QUICK START
--------------------------------------------------------------------------------

WINDOWS:
  Option 1: Drag and Drop
    - Drag your .tsx file onto render.bat
    - The MP4 will appear next to your TSX file

  Option 2: Command Line
    - Open Command Prompt in this folder
    - Run: render.bat path\to\your\video.tsx

MAC / LINUX:
  First time setup:
    1. Install Node.js from https://nodejs.org (or: brew install node)
    2. Open Terminal in the 'renderer' folder
    3. Run: npm install

  To render:
    ./render.sh path/to/your/video.tsx

--------------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------------

  Windows:  render.bat input.tsx [output.mp4]
  Mac/Linux: ./render.sh input.tsx [output.mp4]

Arguments:
  input.tsx    - Path to your TSX composition file (required)
  output.mp4   - Output path (optional, defaults to input folder with timestamp)

Examples (Windows):
  render.bat MyVideo.tsx
  render.bat MyVideo.tsx output.mp4
  render.bat "C:\My Folder\video.tsx"

Examples (Mac/Linux):
  ./render.sh MyVideo.tsx
  ./render.sh MyVideo.tsx output.mp4
  ./render.sh "/path/to/my video.tsx"

--------------------------------------------------------------------------------
TSX FILE FORMAT
--------------------------------------------------------------------------------

Your TSX file must export a compositionConfig object:

  export const compositionConfig = {
    id: 'MyVideo',
    durationInSeconds: 5,
    fps: 30,
    width: 1080,
    height: 1920,
  };

And export a React component (default export recommended):

  const MyVideo: React.FC = () => {
    const frame = useCurrentFrame();
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <h1>Frame {frame}</h1>
      </AbsoluteFill>
    );
  };

  export default MyVideo;

--------------------------------------------------------------------------------
SUPPORTED LIBRARIES
--------------------------------------------------------------------------------

Your TSX file can use these libraries:

  Core:
    - react, react-dom
    - remotion (useCurrentFrame, interpolate, AbsoluteFill, Sequence, etc.)

  Remotion Packages:
    - @remotion/media-utils (audio visualization)
    - @remotion/noise (noise functions)
    - @remotion/paths (SVG path utilities)
    - @remotion/shapes (shape components)
    - @remotion/transitions (transitions)
    - @remotion/motion-blur (motion blur)
    - @remotion/gif (GIF support)
    - @remotion/lottie (Lottie animations)
    - @remotion/preload (asset preloading)
    - @remotion/three (Three.js integration)

  3D Graphics:
    - three (Three.js)
    - @react-three/fiber (React Three Fiber)
    - @react-three/drei (Three.js helpers)

  Animation & Utilities:
    - framer-motion (animations)
    - d3 (data visualization)
    - lodash (utilities)
    - zod (validation)

--------------------------------------------------------------------------------
FIRST RUN
--------------------------------------------------------------------------------

On first run, the renderer will download a headless browser (~150MB).
This is a one-time download and will be cached for future renders.

--------------------------------------------------------------------------------
TROUBLESHOOTING
--------------------------------------------------------------------------------

"No compositionConfig found"
  - Ensure your TSX file exports a compositionConfig object
  - Check for syntax errors in the config

"Module not found"
  - Your TSX file uses a library not included in the renderer
  - See SUPPORTED LIBRARIES section above for available packages

"Browser download failed"
  - Check your internet connection
  - Try running again

Colors not showing in console:
  - Use Windows Terminal or PowerShell for best experience
  - Windows 10+ CMD should support colors

For verbose error output, run from command line:
  render.bat MyVideo.tsx --verbose

--------------------------------------------------------------------------------
SUPPORT
--------------------------------------------------------------------------------

For more information about Remotion:
  https://www.remotion.dev/docs

================================================================================
