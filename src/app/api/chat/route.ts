import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir, getProjectCode } from '@/lib/projectManager';
import { assertGeminiModelId, assertUUID, validateImageUpload } from '@/lib/validate';
import fs from 'fs';
import path from 'path';
import { cookies } from 'next/headers';
import { withRetry } from '@/lib/gemini-retry';
import { withProjectLock, projectLockKey } from '@/lib/project-lock';
import { renderKey } from '@/lib/render-tracker';
import { renderProject } from '@/lib/render-runner';

// Max image size: 10 MB (base64 adds ~33% overhead, so 10MB binary ≈ 13.4MB base64)
const MAX_MESSAGE_LENGTH = 20_000;
const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '4:3', '3:4', '1:1']);
const ALLOWED_RESOLUTIONS = new Set(['720p', '1080p']);

let thesvgCache = '';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();

    // --- Session ID (Blocker 4) ---
    const sid = assertUUID(cookieStore.get('sid')?.value, 'session');

    // --- API Key (Blocker 3: now HttpOnly) ---
    const apiKey = cookieStore.get('gemini_api_key')?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is not set. Please enter it in the sidebar settings.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const { projectId, message: rawMessage, image, options } = await req.json();

    // --- UUID validation (Blocker 1) ---
    assertUUID(projectId, 'projectId');

    if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }
    const message = rawMessage.trim();
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: 'Message is too long.' }, { status: 413 });
    }

    const validatedImage = validateImageUpload(image);

    // Load history snapshot for building the chat context (read-only at this point)
    const historySnapshot = getProjectHistory(sid, projectId);

    // Read and combine all local agent SKILL.md instructions dynamically
    let systemInstruction = 'You are an expert Remotion video developer. Generate a production-ready TSX file based on the user description.';
    try {
      const skillsDir = path.join(process.cwd(), 'skills');
      if (fs.existsSync(skillsDir)) {
        const getSkillFiles = (dir: string): string[] => {
          let results: string[] = [];
          const list = fs.readdirSync(dir);
          list.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat && stat.isDirectory()) {
              results = results.concat(getSkillFiles(fullPath));
            } else if (file === 'SKILL.md') {
              results.push(fullPath);
            }
          });
          return results;
        };
        const skillFiles = getSkillFiles(skillsDir);
        if (skillFiles.length > 0) {
          systemInstruction = skillFiles
            .map(f => fs.readFileSync(f, 'utf-8'))
            .join('\n\n=============================================================================\n\n');
        }
      }

      // If thesvg skill is present, dynamically append the live registry
      if (systemInstruction.includes('thesvg')) {
        if (!thesvgCache) {
          try {
            const res = await fetch('https://thesvg.org/api/registry.json', { next: { revalidate: 86400 } });
            if (res.ok) {
              const data = await res.json();
              const slugs = data.icons.map((i: any) => `- ${i.slug}: ${i.title}`).join('\n');
              thesvgCache = `\n\n### FULL LIVE ICON SLUGS REGISTRY (DYNAMIC)\n${slugs}`;
            }
          } catch (e) {
            console.error('Failed to fetch thesvg registry:', e);
          }
        }
        systemInstruction += thesvgCache;
      }
    } catch (err) {
      console.error('Failed to load dynamic skills:', err);
    }

    const selectedModel = assertGeminiModelId(options?.model);
    if (!ALLOWED_ASPECT_RATIOS.has(options?.aspectRatio) || !ALLOWED_RESOLUTIONS.has(options?.resolution)) {
      return NextResponse.json({ error: 'Invalid render options.' }, { status: 400 });
    }
    if (options?.duration !== 'auto') {
      const requestedDuration = Number(options?.duration);
      if (!Number.isFinite(requestedDuration) || requestedDuration < 1 || requestedDuration > 15) {
        return NextResponse.json({ error: 'Duration must be between 1 and 15 seconds.' }, { status: 400 });
      }
    }
    const model = genAI.getGenerativeModel({ model: selectedModel, systemInstruction });

    const chatHistory = historySnapshot.map((msg: any) => {
      const parts: any[] = [];
      if (msg.role === 'user' && msg.image) {
        try {
          const partsUrl = msg.image.split('/');
          const filename = partsUrl[partsUrl.length - 1];
          const attachmentsDir = path.join(process.cwd(), 'projects', sid, projectId, 'attachments');
          const imgPath = path.join(attachmentsDir, filename);
          if (fs.existsSync(imgPath)) {
            const ext = path.extname(filename).toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.gif') mimeType = 'image/gif';
            const imgBase64 = fs.readFileSync(imgPath).toString('base64');
            parts.push({ inlineData: { mimeType, data: imgBase64 } });
          }
        } catch (e) {
          console.error('Failed to load historical attachment:', e);
        }
      }
      parts.push({ text: msg.content });
      return { role: msg.role === 'model' ? 'model' : 'user', parts };
    });

    const chat = model.startChat({ history: chatHistory });

    // Build prompt with layout instructions
    let promptMessage = message;
    if (options) {
      const { aspectRatio, duration, resolution } = options;
      let width = 1080, height = 1920;
      if (aspectRatio === '16:9') { width = resolution === '1080p' ? 1920 : 1280; height = resolution === '1080p' ? 1080 : 720; }
      else if (aspectRatio === '9:16') { width = resolution === '1080p' ? 1080 : 720; height = resolution === '1080p' ? 1920 : 1280; }
      else if (aspectRatio === '4:3') { width = resolution === '1080p' ? 1440 : 960; height = resolution === '1080p' ? 1080 : 720; }
      else if (aspectRatio === '3:4') { width = resolution === '1080p' ? 1080 : 720; height = resolution === '1080p' ? 1440 : 960; }
      else if (aspectRatio === '1:1') { width = resolution === '1080p' ? 1080 : 720; height = resolution === '1080p' ? 1080 : 720; }

      const durationInstruction = duration === 'auto'
        ? 'Choose a suitable duration in seconds (between 2s and 10s) based on the visual complexity.'
        : `MUST be exactly ${duration} seconds.`;

      promptMessage = `${message}\n\n[System Requirement]: For this video generation, you MUST use these exact compositionConfig settings in your code:\n- width: ${width}\n- height: ${height}\n- durationInSeconds: ${durationInstruction} (and set durationInSeconds as a literal number in compositionConfig, e.g. durationInSeconds: ${duration === 'auto' ? '[AI chosen number]' : duration})\nEnsure all layout mathematics, position coordinates, font sizes, and elements scale cleanly to fit this target resolution (${width}x${height}).`;
    }

    // Save reference image if supplied
    let attachmentUrl = '';
    if (validatedImage) {
      const turnIndex = historySnapshot.filter((m: any) => m.role === 'user').length;
      const attachmentsDir = path.join(process.cwd(), 'projects', sid, projectId, 'attachments');
      if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true });
      const filename = `turn_${turnIndex}.${validatedImage.extension}`;
      const filePath = path.join(attachmentsDir, filename);
      fs.writeFileSync(filePath, validatedImage.buffer);
      attachmentUrl = `/api/projects/${projectId}/attachments/${filename}`;
    }

    // Prepare prompt parts
    const promptParts: any[] = [];
    if (validatedImage) {
      promptParts.push({ inlineData: { mimeType: validatedImage.mimeType, data: validatedImage.data } });
    }
    promptParts.push({ text: promptMessage });

    // Send to Gemini
    const result = await withRetry(() => chat.sendMessage(promptParts));
    const responseText = result.response.text();

    // Extract TSX code block
    const tsxMatch = responseText.match(/```tsx\s*([\s\S]*?)\s*```/);
    let code = '';
    let videoUrl = '';

    if (tsxMatch?.[1]) {
      code = tsxMatch[1].trim();
    } else {
      code = responseText.replace(/^```(tsx)?\n?/i, '').replace(/```$/i, '').trim();
    }

    const lockKey = projectLockKey(sid, projectId);

    if (code) {
      // Render can be long — do it outside the lock so it doesn't block other ops
      const projectDir = getProjectDir(sid, projectId);
      const inputPath = path.join(projectDir, 'video.tsx');

      // Snapshot version count from the read-only snapshot for naming
      const prevVersionsCount = historySnapshot.filter((m: any) => m.role === 'model').length;
      const newVersion = prevVersionsCount + 1;
      const versionedOutputPath = path.join(projectDir, `output_v${newVersion}.mp4`);

      let fallbackWidth = 1080, fallbackHeight = 1920, fallbackDuration = 5;
      if (options) {
        const { aspectRatio, duration, resolution } = options;
        if (aspectRatio === '16:9') { fallbackWidth = resolution === '1080p' ? 1920 : 1280; fallbackHeight = resolution === '1080p' ? 1080 : 720; }
        else if (aspectRatio === '9:16') { fallbackWidth = resolution === '1080p' ? 1080 : 720; fallbackHeight = resolution === '1080p' ? 1920 : 1280; }
        else if (aspectRatio === '4:3') { fallbackWidth = resolution === '1080p' ? 1440 : 960; fallbackHeight = resolution === '1080p' ? 1080 : 720; }
        else if (aspectRatio === '3:4') { fallbackWidth = resolution === '1080p' ? 1080 : 720; fallbackHeight = resolution === '1080p' ? 1440 : 960; }
        else if (aspectRatio === '1:1') { fallbackWidth = resolution === '1080p' ? 1080 : 720; fallbackHeight = resolution === '1080p' ? 1080 : 720; }
        if (duration && duration !== 'auto') fallbackDuration = parseFloat(duration) || 5;
      }

      // Save code optimistically so render can read it
      const oldCode = getProjectCode(sid, projectId);
      saveProjectCode(sid, projectId, code);

      const rk = renderKey(sid, projectId);

      try {
        await renderProject({
          key: rk,
          inputPath,
          outputPath: versionedOutputPath,
          width: fallbackWidth,
          height: fallbackHeight,
          durationInSeconds: fallbackDuration,
        });

        fs.copyFileSync(versionedOutputPath, path.join(projectDir, 'output.mp4'));
        videoUrl = `/api/video/${projectId}`;

        // --- Locked write: re-read fresh history and append atomically ---
        await withProjectLock(lockKey, () => {
          const freshHistory = getProjectHistory(sid, projectId);
          const userMsg: any = { role: 'user', content: message };
          if (attachmentUrl) userMsg.image = attachmentUrl;
          freshHistory.push(userMsg);
          freshHistory.push({ role: 'model', content: responseText });
          saveProjectHistory(sid, projectId, freshHistory);
          return Promise.resolve();
        });
      } catch (renderError: any) {
        // Detect if the render was cancelled by the user
        const wasCancelled = renderError.killed || renderError.signal === 'SIGTERM' || renderError.signal === 'SIGKILL';

        if (wasCancelled) {
          console.log('Render cancelled by user for project:', projectId);
          if (oldCode) saveProjectCode(sid, projectId, oldCode);
          return NextResponse.json({ error: 'Render cancelled by user.' }, { status: 499 });
        }

        console.error('Render failed:', renderError);
        if (oldCode) saveProjectCode(sid, projectId, oldCode);
        else { try { fs.unlinkSync(inputPath); } catch (_) {} }

        return NextResponse.json({
          error: 'Code generated but rendering failed',
          details: renderError.stderr || renderError.stdout || renderError.message,
          code,
        }, { status: 500 });
      }
    } else {
      // No code — just append the conversation turn, still locked
      await withProjectLock(lockKey, () => {
        const freshHistory = getProjectHistory(sid, projectId);
        const userMsg: any = { role: 'user', content: message };
        if (attachmentUrl) userMsg.image = attachmentUrl;
        freshHistory.push(userMsg);
        freshHistory.push({ role: 'model', content: responseText });
        saveProjectHistory(sid, projectId, freshHistory);
        return Promise.resolve();
      });
    }

    return NextResponse.json({ message: responseText, code, videoUrl });
  } catch (error: any) {
    console.error('API Chat Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.status ?? 500 });
  }
}
