import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { cookies } from 'next/headers';
import { withRetry } from '@/lib/gemini-retry';
import { assertGeminiModelId } from '@/lib/validate';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const apiKey = cookieStore.get('gemini_api_key')?.value || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is not set. Please enter it in the sidebar settings.' }, { status: 400 });
    }

    const { prompt, model: selectedModel } = await req.json();

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }
    if (prompt.length > 20_000) {
      return NextResponse.json({ error: 'Prompt is too long' }, { status: 413 });
    }

    const genAI = new GoogleGenAI({ apiKey });
    
    const systemInstruction = `You are an expert prompt engineer for an AI Remotion Video generator.
The user will provide a short, simple idea. Your task is to enhance it into a highly descriptive, visually-rich, and detailed prompt.
Specify colors, typography, animations, components, layout, and mood.
Make the prompt sound like a professional design specification for a motion graphics designer.
Keep the enhanced prompt under 4 sentences.
Do NOT include any filler text, conversational text, or prefixes like "Here is your prompt:". Just output the enhanced prompt text directly.`;

    const modelId = assertGeminiModelId(selectedModel);

    const result = await withRetry(() => genAI.models.generateContent({
      model: modelId,
      contents: prompt.trim(),
      config: { systemInstruction },
    }));
    const enhancedPrompt = result.text;

    return NextResponse.json({ enhancedPrompt });
  } catch (error: any) {
    console.error('Error enhancing prompt:', error);
    return NextResponse.json({ error: error.message || 'Failed to enhance prompt' }, { status: 500 });
  }
}
