import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeJsonAtomic } from '@/lib/atomic-file';
import type {
  McpApprovalPolicy,
  McpConnection,
  McpTransportType,
  PendingMcpApproval,
  PublicMcpConnection,
} from '@/lib/mcp-types';

const PROJECTS_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), 'projects');
const MAX_CONNECTIONS = 20;
const MAX_SECRET_ENTRIES = 30;
const PENDING_TTL_MS = 15 * 60 * 1000;

function sessionPath(sessionId: string): string {
  const directory = path.join(PROJECTS_ROOT, sessionId);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function connectionsPath(sessionId: string): string {
  return path.join(sessionPath(sessionId), 'mcp-connections.json');
}

function pendingPath(sessionId: string, projectId: string): string {
  return path.join(sessionPath(sessionId), projectId, 'pending-mcp.json');
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`${label} must be an object.`), { status: 400 });
  }
  return value as Record<string, unknown>;
}

function optionalStringMap(value: unknown, label: string): Record<string, string> | undefined {
  if (value == null) return undefined;
  const input = assertPlainObject(value, label);
  const entries = Object.entries(input);
  if (entries.length > MAX_SECRET_ENTRIES) {
    throw Object.assign(new Error(`${label} has too many entries.`), { status: 400 });
  }
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > 100 || typeof rawValue !== 'string' || rawValue.length > 8_000) {
      throw Object.assign(new Error(`Invalid ${label} entry.`), { status: 400 });
    }
    output[key] = rawValue;
  }
  return output;
}

function optionalArgs(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== 'string' || item.length > 2_000)) {
    throw Object.assign(new Error('Invalid MCP command arguments.'), { status: 400 });
  }
  return value;
}

function mergeSecrets(
  previous: Record<string, string> | undefined,
  next: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!next) return previous;
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value) merged[key] = value;
    else if (!(key in merged)) merged[key] = '';
  }
  return Object.keys(merged).length ? merged : undefined;
}

function validateUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_000) {
    throw Object.assign(new Error('A valid MCP URL is required.'), { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('A valid MCP URL is required.'), { status: 400 });
  }
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw Object.assign(new Error('MCP URLs must use HTTPS; loopback HTTP is allowed for local servers.'), { status: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error('Put credentials in headers, not the MCP URL.'), { status: 400 });
  }
  return url.toString();
}

export function listMcpConnections(sessionId: string): McpConnection[] {
  return readJson<McpConnection[]>(connectionsPath(sessionId), []);
}

export function publicMcpConnection(connection: McpConnection): PublicMcpConnection {
  const { headers, env, ...safe } = connection;
  return {
    ...safe,
    headerNames: Object.keys(headers ?? {}),
    envNames: Object.keys(env ?? {}),
  };
}

export function getMcpConnection(sessionId: string, connectionId: string): McpConnection {
  const found = listMcpConnections(sessionId).find(connection => connection.id === connectionId);
  if (!found) throw Object.assign(new Error('MCP connection not found.'), { status: 404 });
  return found;
}

export function saveMcpConnection(
  sessionId: string,
  rawInput: unknown,
  connectionId?: string,
): McpConnection {
  const input = assertPlainObject(rawInput, 'Connection');
  const connections = listMcpConnections(sessionId);
  const existingIndex = connectionId ? connections.findIndex(connection => connection.id === connectionId) : -1;
  const existing = existingIndex >= 0 ? connections[existingIndex] : undefined;
  if (connectionId && !existing) throw Object.assign(new Error('MCP connection not found.'), { status: 404 });
  if (!existing && connections.length >= MAX_CONNECTIONS) {
    throw Object.assign(new Error(`Maximum ${MAX_CONNECTIONS} MCP connections reached.`), { status: 400 });
  }

  const name = typeof input.name === 'string' ? input.name.trim() : existing?.name;
  if (!name || name.length > 80) throw Object.assign(new Error('Connection name is required (80 characters max).'), { status: 400 });

  const transport = (input.transport ?? existing?.transport) as McpTransportType;
  if (!['streamable-http', 'sse', 'stdio'].includes(transport)) {
    throw Object.assign(new Error('Invalid MCP transport.'), { status: 400 });
  }
  const approvalPolicy = (input.approvalPolicy ?? existing?.approvalPolicy ?? 'always') as McpApprovalPolicy;
  if (!['always', 'read-only'].includes(approvalPolicy)) {
    throw Object.assign(new Error('Invalid MCP approval policy.'), { status: 400 });
  }

  const now = Date.now();
  const connection: McpConnection = {
    id: existing?.id ?? randomUUID(),
    name,
    transport,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : (existing?.enabled ?? true),
    approvalPolicy,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (transport === 'stdio') {
    const command = typeof input.command === 'string' ? input.command.trim() : existing?.command;
    if (!command || command.length > 1_000 || /[\r\n\0]/.test(command)) {
      throw Object.assign(new Error('A valid MCP command is required.'), { status: 400 });
    }
    connection.command = command;
    connection.args = optionalArgs(input.args) ?? existing?.args ?? [];
    connection.env = mergeSecrets(existing?.env, optionalStringMap(input.env, 'Environment'));
  } else {
    connection.url = validateUrl(input.url ?? existing?.url);
    connection.headers = mergeSecrets(existing?.headers, optionalStringMap(input.headers, 'Headers'));
  }

  if (existingIndex >= 0) connections[existingIndex] = connection;
  else connections.push(connection);
  writeJsonAtomic(connectionsPath(sessionId), connections);
  return connection;
}

export function deleteMcpConnection(sessionId: string, connectionId: string): boolean {
  const connections = listMcpConnections(sessionId);
  const next = connections.filter(connection => connection.id !== connectionId);
  if (next.length === connections.length) return false;
  writeJsonAtomic(connectionsPath(sessionId), next);
  return true;
}

export function savePendingApproval(
  sessionId: string,
  approval: Omit<PendingMcpApproval, 'id' | 'createdAt' | 'expiresAt'>,
): PendingMcpApproval {
  if (JSON.stringify(approval.arguments).length > 100_000) {
    throw Object.assign(new Error('MCP tool arguments are too large for approval.'), { status: 413 });
  }
  const now = Date.now();
  const pending: PendingMcpApproval = {
    ...approval,
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
  };
  writeJsonAtomic(pendingPath(sessionId, approval.projectId), pending);
  return pending;
}

export function consumePendingApproval(
  sessionId: string,
  projectId: string,
  approvalId: string,
): PendingMcpApproval {
  const filePath = pendingPath(sessionId, projectId);
  const pending = readJson<PendingMcpApproval | null>(filePath, null);
  if (!pending || pending.id !== approvalId || pending.projectId !== projectId) {
    throw Object.assign(new Error('Pending MCP approval not found.'), { status: 404 });
  }
  try { fs.unlinkSync(filePath); } catch {}
  if (pending.expiresAt < Date.now()) {
    throw Object.assign(new Error('MCP approval expired.'), { status: 410 });
  }
  return pending;
}

export function readPendingApproval(sessionId: string, projectId: string): PendingMcpApproval | null {
  const filePath = pendingPath(sessionId, projectId);
  const pending = readJson<PendingMcpApproval | null>(filePath, null);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    try { fs.unlinkSync(filePath); } catch {}
    return null;
  }
  return pending;
}

export function clearPendingApproval(sessionId: string, projectId: string): void {
  try { fs.unlinkSync(pendingPath(sessionId, projectId)); } catch {}
}
