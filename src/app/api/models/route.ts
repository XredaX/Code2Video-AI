import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const FALLBACK_MODELS = [
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
];

export async function GET() {
  const cookieStore = await cookies();
  const apiKey = cookieStore.get('gemini_api_key')?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(FALLBACK_MODELS);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache list for 1 hour
    
    if (!res.ok) {
      throw new Error(`Failed to fetch models from Google: ${res.statusText}`);
    }

    const data = await res.json();
    
    if (!data.models || !Array.isArray(data.models)) {
      return NextResponse.json(FALLBACK_MODELS);
    }

    // Filter to generative content models that contain 'gemini'
    const filtered = data.models
      .filter((m: any) => 
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name?.includes('gemini')
      )
      .map((m: any) => {
        // Strip the "models/" prefix from model names
        const cleanId = m.name.startsWith('models/') ? m.name.substring(7) : m.name;
        return {
          id: cleanId,
          displayName: m.displayName || cleanId
            .split('-')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        };
      });

    // If API returned no compatible models, return fallbacks
    if (filtered.length === 0) {
      return NextResponse.json(FALLBACK_MODELS);
    }

    return NextResponse.json(filtered);
  } catch (err: any) {
    console.error('Error fetching Gemini models, using fallbacks:', err.message);
    return NextResponse.json(FALLBACK_MODELS);
  }
}
