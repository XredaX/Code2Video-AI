# AI Animation & Video Editor

Local-first Next.js application that asks Google Gemini to generate Remotion TSX, then renders the composition to MP4.

This tool targets programmatic motion graphics, UI animation, explainers, and logo reveals. It is not a live-action video generator.

## Features

- Text-to-animation code generation with prompt enhancement.
- Versioned project history, rollback, manual code editing, and timeline controls.
- Image references with validated JPEG, PNG, WebP, and GIF uploads.
- Per-project transactional writes and serialized renders.
- Containerized Remotion execution with no network, read-only input, dropped capabilities, and CPU/memory/process limits.
- Local-only web server binding by default.

## Requirements

- Node.js 20.9 or newer.
- Docker Desktop (recommended and used by default for rendering).
- A Google Gemini API key.

## Setup

```bash
npm install
npm run renderer:image
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), then set the Gemini API key from the sidebar.

The renderer image is tagged `ai-video-editor-renderer:4.0.503`. Rebuild it after changing `renderer/`, its package lock, or the image tag.

## Rendering modes

The secure default is Docker:

```text
RENDERER_MODE=docker
REMOTION_RENDERER_IMAGE=ai-video-editor-renderer:4.0.503
```

Docker renders run with `--network none`. Generated compositions must therefore use bundled or local assets. Remote fonts, audio, images, and APIs are unavailable during rendering.

For trusted local development only, bypass the container:

```powershell
$env:RENDERER_MODE='local'
npm run dev
```

Local mode executes generated TSX with the current user's permissions. It is rejected when `NODE_ENV=production`.

## Architecture

- `src/app/` — Next.js UI and API routes.
- `src/components/editor/` — workspace UI modules and editor parsing utilities.
- `src/lib/projectManager.ts` — session-scoped project persistence.
- `src/lib/project-lock.ts` — in-process and cross-process serialization.
- `src/lib/render-runner.ts` — Docker/local renderer boundary.
- `renderer/` — pinned Remotion CLI and hardened container image.
- `skills/` — local generation instructions injected into Gemini context.
- `projects/` — local user data and rendered media; intentionally ignored by Git.

Generated code is rendered into unique staging files. Canonical code, video, and history are promoted only after a successful render. Rollback and manual editor renders use the same project lock.

## Commands

```bash
npm run dev             # Local-only development server
npm run build           # Production build
npm run start           # Local-only production server
npm run lint            # ESLint
npm run renderer:image  # Build hardened renderer image
```

## Security boundary

This remains a single-user local tool. The server binds to loopback and rejects non-loopback hostnames. Do not expose it through a reverse proxy or tunnel without adding authentication, authorization, request limits, and durable isolated storage.
