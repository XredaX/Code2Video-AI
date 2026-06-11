import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// ---------------------------------------------------------------------------
// Curated fallback (shown when no API key is configured)
// ---------------------------------------------------------------------------
const FALLBACK_MODELS = [
  { id: 'gemini-2.5-pro',        displayName: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash',      displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
];

// ---------------------------------------------------------------------------
// Pattern-based filter — no hardcoded IDs.
// Accepts any model whose clean ID matches the "stable release" shape:
//   gemini-{X}.{Y}-{type}   where type ∈ pro | flash | flash-lite | flash-8b
// Automatically excludes everything that matches an EXCLUSION rule.
// ---------------------------------------------------------------------------

/** Patterns that mark a model as noise / unsuitable for code generation. */
const EXCLUDE_PATTERNS: RegExp[] = [
  /tts/i,               // text-to-speech (audio, not useful here)
  /preview/i,           // experimental / unstable preview builds
  /latest/i,            // floating "-latest" aliases (unpredictable versioning)
  /-exp/i,              // experimental variants
  /-\d{3}(-|$)/,        // numbered revisions: -001, -002, etc.
  /custom.?tools/i,     // custom-tools specialisations
  /nano.?banana/i,      // internal Google codename (shows up in displayName)
];

/**
 * A model ID is "clean & stable" when it matches:
 *   gemini-{major}.{minor}-{type}
 *   e.g. gemini-2.5-pro | gemini-2.0-flash | gemini-1.5-flash-8b
 */
const STABLE_ID_PATTERN =
  /^gemini-\d+\.\d+-(pro|flash|flash-lite|flash-8b)$/i;

/** Priority order for sorting: higher = shown first. */
function modelSortKey(id: string): number {
  const versionMatch = id.match(/^gemini-(\d+)\.(\d+)/);
  if (!versionMatch) return 0;
  const major = parseInt(versionMatch[1], 10);
  const minor = parseInt(versionMatch[2], 10);
  const version = major * 100 + minor; // e.g. 2.5 → 205, 2.0 → 200, 1.5 → 105

  // Type bonus: pro > flash > flash-lite > flash-8b
  const typeBonus = id.endsWith('-pro')
    ? 3
    : id.endsWith('-flash') && !id.includes('flash-lite') && !id.includes('flash-8b')
    ? 2
    : id.endsWith('-flash-lite')
    ? 1
    : 0;

  return version * 10 + typeBonus;
}

export async function GET() {
  const cookieStore = await cookies();
  const apiKey =
    cookieStore.get('gemini_api_key')?.value || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(FALLBACK_MODELS);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 hour

    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.statusText}`);
    }

    const data = await res.json();

    if (!data.models || !Array.isArray(data.models)) {
      return NextResponse.json(FALLBACK_MODELS);
    }

    const filtered = (data.models as any[])
      // 1. Must support text generation
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      // 2. Must be a Gemini model
      .filter((m) => m.name?.includes('gemini'))
      // 3. Strip "models/" prefix to get a clean ID
      .map((m) => {
        const id: string = m.name.startsWith('models/')
          ? m.name.substring(7)
          : m.name;
        return { id, displayName: (m.displayName as string) || id };
      })
      // 4. Exclude noise by pattern (check both id and displayName)
      .filter(({ id, displayName }) =>
        !EXCLUDE_PATTERNS.some(
          (p) => p.test(id) || p.test(displayName)
        )
      )
      // 5. Only keep stable release IDs (e.g. gemini-2.5-flash, not gemini-flash)
      .filter(({ id }) => STABLE_ID_PATTERN.test(id))
      // 6. Sort: newest + most capable first
      .sort((a, b) => modelSortKey(b.id) - modelSortKey(a.id));

    return NextResponse.json(filtered.length > 0 ? filtered : FALLBACK_MODELS);
  } catch (err: any) {
    console.error('Error fetching Gemini models, using fallbacks:', err.message);
    return NextResponse.json(FALLBACK_MODELS);
  }
}
