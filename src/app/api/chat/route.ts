import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProjectHistory, saveProjectHistory, saveProjectCode, getProjectDir, getProjectCode } from '@/lib/projectManager';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { cookies } from 'next/headers';

const execAsync = util.promisify(exec);

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const apiKey = cookieStore.get('gemini_api_key')?.value || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is not set. Please enter it in the sidebar settings.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const { projectId, message, image, options } = await req.json();

    if (!projectId || !message) {
      return NextResponse.json({ error: 'Missing projectId or message' }, { status: 400 });
    }

    // Load history
    const history = getProjectHistory(projectId);
    
    // Read the system instructions
    const promptPath = path.join(process.cwd(), 'Prompt.txt');
    const systemInstruction = fs.existsSync(promptPath) 
      ? fs.readFileSync(promptPath, 'utf-8')
      : 'You are an expert Remotion video developer. Generate a production-ready TSX file based on the user description.';

    // Determine target model
    const selectedModel = options?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Prepare Gemini chat session
    const model = genAI.getGenerativeModel({
      model: selectedModel,
      systemInstruction: systemInstruction,
    });

    const chatHistory = history.map((msg: any) => {
      const parts: any[] = [];
      if (msg.role === 'user' && msg.image) {
        try {
          const partsUrl = msg.image.split('/');
          const filename = partsUrl[partsUrl.length - 1];
          const attachmentsDir = path.join(process.cwd(), 'projects', projectId, 'attachments');
          const imgPath = path.join(attachmentsDir, filename);
          if (fs.existsSync(imgPath)) {
            const ext = path.extname(filename).toLowerCase();
            let mimeType = 'image/jpeg';
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.gif') mimeType = 'image/gif';
            
            const imgBase64 = fs.readFileSync(imgPath).toString('base64');
            parts.push({
              inlineData: {
                mimeType,
                data: imgBase64
              }
            });
          }
        } catch (e) {
          console.error('Failed to load historical attachment:', e);
        }
      }
      parts.push({ text: msg.content });
      return {
        role: msg.role === 'model' ? 'model' : 'user',
        parts
      };
    });

    const chat = model.startChat({
      history: chatHistory,
    });

    // Build prompt message with layout instructions if options are supplied
    let promptMessage = message;
    if (options) {
      const { aspectRatio, duration, resolution } = options;
      let width = 1080;
      let height = 1920;
      
      if (aspectRatio === '16:9') {
        width = resolution === '1080p' ? 1920 : 1280;
        height = resolution === '1080p' ? 1080 : 720;
      } else if (aspectRatio === '9:16') {
        width = resolution === '1080p' ? 1080 : 720;
        height = resolution === '1080p' ? 1920 : 1280;
      } else if (aspectRatio === '4:3') {
        width = resolution === '1080p' ? 1440 : 960;
        height = resolution === '1080p' ? 1080 : 720;
      } else if (aspectRatio === '3:4') {
        width = resolution === '1080p' ? 1080 : 720;
        height = resolution === '1080p' ? 1440 : 960;
      } else if (aspectRatio === '1:1') {
        width = resolution === '1080p' ? 1080 : 720;
        height = resolution === '1080p' ? 1080 : 720;
      }

      let durationInstruction = '';
      if (duration === 'auto') {
        durationInstruction = 'Choose a suitable duration in seconds (between 2s and 10s) based on the visual complexity.';
      } else {
        durationInstruction = `MUST be exactly ${duration} seconds.`;
      }

      promptMessage = `${message}

[System Requirement]: For this video generation, you MUST use these exact compositionConfig settings in your code:
- width: ${width}
- height: ${height}
- durationInSeconds: ${durationInstruction} (and set durationInSeconds as a literal number in compositionConfig, e.g. durationInSeconds: ${duration === 'auto' ? '[AI chosen number]' : duration})
Ensure all layout mathematics, position coordinates, font sizes, and elements scale cleanly to fit this target resolution (${width}x${height}).`;
    }

    // Save reference image if supplied
    let attachmentUrl = '';
    if (image && image.data && image.mimeType) {
      const turnIndex = history.filter((m: any) => m.role === 'user').length;
      const attachmentsDir = path.join(process.cwd(), 'projects', projectId, 'attachments');
      if (!fs.existsSync(attachmentsDir)) {
        fs.mkdirSync(attachmentsDir, { recursive: true });
      }
      const ext = image.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : image.mimeType.split('/')[1];
      const filename = `turn_${turnIndex}.${ext}`;
      const filePath = path.join(attachmentsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(image.data, 'base64'));
      attachmentUrl = `/api/projects/${projectId}/attachments/${filename}`;
    }

    // Prepare prompt parts (supports multimodal text + image)
    const promptParts: any[] = [];
    if (image && image.data && image.mimeType) {
      promptParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }
    promptParts.push({ text: promptMessage });

    // Send the user message
    const result = await chat.sendMessage(promptParts);
    const responseText = result.response.text();

    // Extract TSX code block
    const tsxMatch = responseText.match(/```tsx\s*([\s\S]*?)\s*```/);
    let code = '';
    let videoUrl = '';
    
    if (tsxMatch && tsxMatch[1]) {
      code = tsxMatch[1];
      const oldCode = getProjectCode(projectId);
      
      // Save new code to file for compiling
      saveProjectCode(projectId, code);

      // Render the video
      const projectDir = getProjectDir(projectId);
      const inputPath = path.join(projectDir, 'video.tsx');
      const outputPath = path.join(projectDir, 'output.mp4');

      // Determine the node executable
      const portableNode = path.join(process.cwd(), 'node', 'node.exe');
      const nodeExe = fs.existsSync(portableNode) ? portableNode : 'node';
      const renderCliPath = path.join(process.cwd(), 'renderer', 'render-cli.js');

      const command = `"${nodeExe}" "${renderCliPath}" --input="${inputPath}" --output="${outputPath}"`;
      
      try {
        await execAsync(command);
        videoUrl = `/api/video/${projectId}`;

        // Render succeeded, commit changes to history
        const userMsg: any = { role: 'user', content: message };
        if (attachmentUrl) userMsg.image = attachmentUrl;
        history.push(userMsg);
        history.push({ role: 'model', content: responseText });
        saveProjectHistory(projectId, history);
      } catch (renderError: any) {
        console.error('Render failed:', renderError);

        // Rollback the code file to the last working version
        if (oldCode) {
          saveProjectCode(projectId, oldCode);
        } else {
          try {
            fs.unlinkSync(inputPath);
          } catch (e) {}
        }

        return NextResponse.json({ 
          error: 'Code generated but rendering failed', 
          details: renderError.stderr || renderError.stdout || renderError.message,
          code 
        }, { status: 500 });
      }
    } else {
      // No TSX code block, just save conversation turn
      const userMsg: any = { role: 'user', content: message };
      if (attachmentUrl) userMsg.image = attachmentUrl;
      history.push(userMsg);
      history.push({ role: 'model', content: responseText });
      saveProjectHistory(projectId, history);
    }

    return NextResponse.json({
      message: responseText,
      code,
      videoUrl
    });

  } catch (error: any) {
    console.error('API Chat Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
