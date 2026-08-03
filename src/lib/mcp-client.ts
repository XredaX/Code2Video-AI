import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { writeFileAtomic } from '@/lib/atomic-file';
import type { McpConnection, McpToolSummary } from '@/lib/mcp-types';
import { validateImageUpload } from '@/lib/validate';

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_TOOLS_PER_CONNECTION = 100;
const MAX_RESULT_TEXT = 60_000;
const MAX_RESULT_IMAGES = 4;

export interface McpExposedTool extends McpToolSummary {
  functionName: string;
  connectionId: string;
  connectionName: string;
  inputSchema: Record<string, unknown>;
}

export interface NormalizedMcpResult {
  isError: boolean;
  output: string;
  assets: string[];
}

export interface OpenMcpSession {
  connection: McpConnection;
  tools: McpExposedTool[];
  callTool(toolName: string, args: Record<string, unknown>, projectDir: string): Promise<NormalizedMcpResult>;
  close(): Promise<void>;
}

function functionName(connectionId: string, toolName: string): string {
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 76) || 'tool';
  const suffix = createHash('sha256').update(toolName).digest('hex').slice(0, 8);
  return `mcp_${connectionId.replaceAll('-', '').slice(0, 12)}_${safeTool}_${suffix}`;
}

function authenticatedFetch(headers: Record<string, string> | undefined): typeof fetch {
  return async (input, init) => {
    const merged = new Headers(headers);
    const protocolHeaders = new Headers(init?.headers);
    protocolHeaders.forEach((value, key) => merged.set(key, value));
    return fetch(input, { ...init, headers: merged, redirect: 'error' });
  };
}

function createTransport(connection: McpConnection): Transport {
  if (connection.transport === 'stdio') {
    return new StdioClientTransport({
      command: connection.command!,
      args: connection.args ?? [],
      env: { ...getDefaultEnvironment(), ...connection.env },
      stderr: 'pipe',
      maxBufferSize: 10 * 1024 * 1024,
    });
  }

  const customFetch = authenticatedFetch(connection.headers);
  const url = new URL(connection.url!);
  if (connection.transport === 'sse') {
    return new SSEClientTransport(url, {
      fetch: customFetch,
      requestInit: { headers: connection.headers },
    });
  }
  return new StreamableHTTPClientTransport(url, {
    fetch: customFetch,
    requestInit: { headers: connection.headers },
    reconnectionOptions: {
      initialReconnectionDelay: 500,
      maxReconnectionDelay: 2_000,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 1,
    },
  });
}

async function connectWithTimeout(client: Client, transport: Transport): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('MCP connection timed out.')), CONNECT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stringifyCapped(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!text) return '';
  return text.length <= MAX_RESULT_TEXT ? text : `${text.slice(0, MAX_RESULT_TEXT)}\n[tool result truncated]`;
}

function saveInlineImage(projectDir: string, mimeType: string, data: string): string | null {
  try {
    const image = validateImageUpload({ mimeType, data });
    if (!image) return null;
    const filename = `mcp-${randomUUID()}.${image.extension}`;
    const assetsDir = path.join(projectDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const outputPath = path.join(assetsDir, filename);
    writeFileAtomic(outputPath, image.buffer);
    return `assets/${filename}`;
  } catch {
    return null;
  }
}

function normalizeResult(raw: unknown, projectDir: string): NormalizedMcpResult {
  const result = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const assets: string[] = [];
  const pieces: string[] = [];
  const content = Array.isArray(result.content) ? result.content : [];

  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (block.type === 'text' && typeof block.text === 'string') {
      pieces.push(block.text);
    } else if (block.type === 'image' && typeof block.mimeType === 'string' && typeof block.data === 'string') {
      if (assets.length >= MAX_RESULT_IMAGES) continue;
      const asset = saveInlineImage(projectDir, block.mimeType, block.data);
      if (asset) {
        assets.push(asset);
        pieces.push(`Image saved locally. Use staticFile('${asset}') in Remotion.`);
      } else {
        pieces.push('[Unsupported or invalid image omitted]');
      }
    } else if (block.type === 'resource' && block.resource && typeof block.resource === 'object') {
      const resource = block.resource as Record<string, unknown>;
      if (typeof resource.text === 'string') pieces.push(resource.text);
      else pieces.push(stringifyCapped({ uri: resource.uri, mimeType: resource.mimeType }));
    } else if (block.type === 'resource_link') {
      pieces.push(stringifyCapped({
        name: block.name,
        uri: block.uri,
        description: block.description,
        mimeType: block.mimeType,
      }));
    }
  }

  if (result.structuredContent) pieces.push(stringifyCapped(result.structuredContent));
  if ('toolResult' in result) pieces.push(stringifyCapped(result.toolResult));
  const output = stringifyCapped(pieces.filter(Boolean).join('\n\n') || result);
  return { isError: result.isError === true, output, assets };
}

export async function openMcpSession(connection: McpConnection): Promise<OpenMcpSession> {
  const client = new Client({ name: 'code2video-ai', version: '1.0.0' }, { capabilities: {} });
  const transport = createTransport(connection);
  try {
    await connectWithTimeout(client, transport);
    const discovered: McpExposedTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CONNECT_TIMEOUT_MS });
      for (const tool of page.tools) {
        if (discovered.length >= MAX_TOOLS_PER_CONNECTION) break;
        discovered.push({
          functionName: functionName(connection.id, tool.name),
          connectionId: connection.id,
          connectionName: connection.name,
          name: tool.name,
          description: (tool.description ?? '').slice(0, 2_000),
          readOnly: tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true,
          destructive: tool.annotations?.destructiveHint === true,
          inputSchema: tool.inputSchema as Record<string, unknown>,
        });
      }
      cursor = discovered.length < MAX_TOOLS_PER_CONNECTION ? page.nextCursor : undefined;
    } while (cursor);

    return {
      connection,
      tools: discovered,
      async callTool(toolName, args, projectDir) {
        const result = await client.callTool(
          { name: toolName, arguments: args },
          undefined,
          { timeout: CALL_TIMEOUT_MS, maxTotalTimeout: CALL_TIMEOUT_MS },
        );
        return normalizeResult(result, projectDir);
      },
      async close() {
        await client.close();
      },
    };
  } catch (error) {
    try { await client.close(); } catch {}
    throw error;
  }
}

export async function probeMcpConnection(connection: McpConnection): Promise<McpToolSummary[]> {
  const session = await openMcpSession(connection);
  try {
    return session.tools.map(({ name, description, readOnly, destructive }) => ({
      name,
      description,
      readOnly,
      destructive,
    }));
  } finally {
    await session.close();
  }
}
