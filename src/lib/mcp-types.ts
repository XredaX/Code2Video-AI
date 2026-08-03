export type McpTransportType = 'streamable-http' | 'sse' | 'stdio';
export type McpApprovalPolicy = 'always' | 'read-only';

export interface McpConnection {
  id: string;
  name: string;
  transport: McpTransportType;
  enabled: boolean;
  approvalPolicy: McpApprovalPolicy;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface PublicMcpConnection extends Omit<McpConnection, 'headers' | 'env'> {
  headerNames: string[];
  envNames: string[];
}

export interface McpToolSummary {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
}

export interface PendingMcpApproval {
  id: string;
  projectId: string;
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  createdAt: number;
  expiresAt: number;
}
