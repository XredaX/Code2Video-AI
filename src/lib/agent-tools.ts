import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import type { FunctionDeclaration } from '@google/genai';
import type { McpExposedTool } from '@/lib/mcp-client';
import { writeFileAtomic } from '@/lib/atomic-file';

export const RENDER_TOOL_NAME = 'render_video';
export const PREVIEW_TOOL_NAME = 'preview_video';
export const SEARCH_ICONS_TOOL_NAME = 'search_icons';
export const BRAND_ICON_TOOL_NAME = 'get_brand_icon';

export interface RenderVideoArgs {
  code: string;
  message: string;
  suggestions?: string[];
}

export interface PreviewVideoArgs {
  code: string;
}

function cleanSchema(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => cleanSchema(item, depth + 1));
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (['$schema', '$id', 'examples'].includes(key)) continue;
    output[key] = cleanSchema(child, depth + 1);
  }
  return output;
}

export function buildFunctionDeclarations(mcpTools: McpExposedTool[]): FunctionDeclaration[] {
  const builtIns: FunctionDeclaration[] = [
    {
      name: PREVIEW_TOOL_NAME,
      description: 'Render a representative still from complete Remotion TSX so you can inspect composition, scale, hierarchy, and aspect-ratio fit before final rendering.',
      parametersJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string', description: 'Complete, executable TSX source to preview.' },
        },
        required: ['code'],
      },
    },
    {
      name: RENDER_TOOL_NAME,
      description: 'Finalize and render complete Remotion TSX after previewing this exact code and confirming its visual quality.',
      parametersJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string', description: 'Complete, executable TSX source with compositionConfig and a default component export.' },
          message: { type: 'string', description: 'Short user-facing summary of the completed video.' },
          suggestions: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' },
            description: 'Up to three useful follow-up edit ideas.',
          },
        },
        required: ['code', 'message'],
      },
    },
    {
      name: SEARCH_ICONS_TOOL_NAME,
      description: 'Search the installed Lucide icon set and return verified component import names. Use this before importing uncertain UI icon names.',
      parametersJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { query: { type: 'string', description: 'Icon concept, such as analytics, camera, arrow, cloud, or music.' } },
        required: ['query'],
      },
    },
    {
      name: BRAND_ICON_TOOL_NAME,
      description: 'Fetch a verified brand logo from theSVG and save it as a local render asset. Use for company/product logos, not generic UI icons.',
      parametersJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slug: { type: 'string', description: 'Exact lowercase theSVG brand slug, such as github, spotify, openai, or stripe.' },
          variant: { type: 'string', enum: ['default', 'mono', 'light', 'dark', 'wordmark', 'wordmarkLight', 'wordmarkDark'] },
        },
        required: ['slug'],
      },
    },
  ];

  return builtIns.concat(mcpTools.map(tool => ({
    name: tool.functionName,
    description: `[MCP: ${tool.connectionName}] ${tool.description || tool.name}${tool.readOnly ? ' (read-only)' : ' (may perform actions)'}`,
    parametersJsonSchema: cleanSchema(tool.inputSchema),
  })));
}

function iconComponentName(iconName: string): string {
  return iconName.split('-').filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join('');
}

function searchIcons(rawQuery: unknown): Record<string, unknown> {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().toLowerCase() : '';
  if (!query) return { error: 'Icon query is required.' };
  const tokens = query.split(/[^a-z0-9]+/).filter(Boolean);
  const scored = Object.keys(dynamicIconImports).map(name => {
    const normalized = name.toLowerCase();
    const score = tokens.reduce((total, token) => total + (normalized === token ? 10 : normalized.includes(token) ? 3 : 0), 0);
    return { name, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 24);
  return {
    icons: scored.map(item => ({ kebabName: item.name, importName: iconComponentName(item.name) })),
    usage: "Import verified names from 'lucide-react'. Animate their wrapper with frame-based transforms; set strokeWidth near 1.5 for refined lines.",
  };
}

function sanitizeSvg(source: string): string {
  if (source.length > 1_000_000 || !/^\s*<svg[\s>]/i.test(source)) throw new Error('Invalid brand SVG response.');
  if (/<(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(source)) throw new Error('Unsafe brand SVG response.');
  if (/\son[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|javascript:|data:)/i.test(source)) {
    throw new Error('Unsafe external content in brand SVG.');
  }
  return source;
}

async function getBrandIcon(args: Record<string, unknown>, projectDir: string): Promise<Record<string, unknown>> {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  const variant = typeof args.variant === 'string' ? args.variant : 'default';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return { error: 'Invalid brand icon slug.' };
  if (!['default', 'mono', 'light', 'dark', 'wordmark', 'wordmarkLight', 'wordmarkDark'].includes(variant)) {
    return { error: 'Invalid brand icon variant.' };
  }
  const response = await fetch(`https://thesvg.org/icons/${slug}/${variant}.svg`, {
    headers: { accept: 'image/svg+xml' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { error: `Brand icon not found (${response.status}).` };
  const svg = sanitizeSvg(await response.text());
  const filename = `brand-${slug}-${variant}-${randomUUID().slice(0, 8)}.svg`;
  const assetsDir = path.join(projectDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  writeFileAtomic(path.join(assetsDir, filename), svg);
  const assetPath = `assets/${filename}`;
  return { assetPath, usage: `Use <Img src={staticFile('${assetPath}')} /> in Remotion.` };
}

export async function executeBuiltInAgentTool(
  name: string,
  args: Record<string, unknown>,
  projectDir: string,
): Promise<Record<string, unknown> | null> {
  if (name === SEARCH_ICONS_TOOL_NAME) return searchIcons(args.query);
  if (name === BRAND_ICON_TOOL_NAME) return getBrandIcon(args, projectDir);
  return null;
}

export function validateRenderArgs(args: Record<string, unknown>): RenderVideoArgs {
  if (typeof args.code !== 'string' || args.code.length < 100 || args.code.length > 500_000) {
    throw Object.assign(new Error('The agent returned invalid render code.'), { status: 502 });
  }
  if (typeof args.message !== 'string' || !args.message.trim() || args.message.length > 4_000) {
    throw Object.assign(new Error('The agent returned an invalid render summary.'), { status: 502 });
  }
  const suggestions = Array.isArray(args.suggestions)
    ? args.suggestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
    : undefined;
  return { code: args.code.trim(), message: args.message.trim(), suggestions };
}

export function validatePreviewArgs(args: Record<string, unknown>): PreviewVideoArgs {
  if (typeof args.code !== 'string' || args.code.length < 100 || args.code.length > 500_000) {
    throw Object.assign(new Error('The agent returned invalid preview code.'), { status: 502 });
  }
  return { code: args.code.trim() };
}
