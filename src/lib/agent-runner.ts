import { createHash } from 'crypto';
import { GoogleGenAI, type Content, type FunctionCall, type Part } from '@google/genai';
import { buildAgentSystemInstruction } from '@/lib/agent-prompt';
import {
  RENDER_TOOL_NAME,
  PREVIEW_TOOL_NAME,
  buildFunctionDeclarations,
  executeBuiltInAgentTool,
  validatePreviewArgs,
  validateRenderArgs,
  type RenderVideoArgs,
} from '@/lib/agent-tools';
import type { McpExposedTool, OpenMcpSession } from '@/lib/mcp-client';
import { withRetry } from '@/lib/gemini-retry';

const MAX_AGENT_STEPS = 10;
const MAX_EMPTY_RESPONSE_RECOVERIES = 2;

export type AgentTurnResult =
  | { mode: 'message'; message: string }
  | { mode: 'render'; render: RenderVideoArgs }
  | {
      mode: 'approval';
      message: string;
      request: {
        connectionId: string;
        toolName: string;
        arguments: Record<string, unknown>;
        reason: string;
      };
    };

function functionResponse(call: FunctionCall, response: Record<string, unknown>): Part {
  return {
    functionResponse: {
      id: call.id,
      name: call.name,
      response,
    },
  };
}

function codeHash(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function errorText(error: unknown): string {
  const candidate = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const value = candidate?.stderr || candidate?.stdout || candidate?.message || 'Preview render failed.';
  return String(value).replace(/\x1b\[[0-9;]*m/g, '').slice(-6_000);
}

function findMcpTool(sessions: OpenMcpSession[], functionName: string) {
  for (const session of sessions) {
    const tool = session.tools.find(candidate => candidate.functionName === functionName);
    if (tool) return { session, tool };
  }
  return null;
}

function approvalReason(connectionName: string, tool: McpExposedTool): string {
  const effect = tool.destructive ? 'may make a destructive change' : 'may read data or perform an external action';
  return `${connectionName} / ${tool.name} ${effect}.`;
}

export async function runAgentTurn(input: {
  apiKey: string;
  model: string;
  history: Content[];
  message: Part[];
  sessions: OpenMcpSession[];
  unavailableConnections: string[];
  projectDir: string;
  previewCode: (code: string) => Promise<{ data: string; mimeType: string; width: number; height: number }>;
}): Promise<AgentTurnResult> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const mcpTools = input.sessions.flatMap(session => session.tools);
  const declarations = buildFunctionDeclarations(mcpTools);
  const chat = ai.chats.create({
    model: input.model,
    history: input.history,
    config: {
      systemInstruction: buildAgentSystemInstruction(mcpTools, input.unavailableConnections),
      tools: [{ functionDeclarations: declarations }],
      temperature: 0.8,
    },
  });

  let response = await withRetry(() => chat.sendMessage({ message: input.message }));
  const previewedCode = new Set<string>();
  let lastPreviewedCode: string | null = null;
  let previewWorkflowStarted = false;
  let emptyResponseRecoveries = 0;
  let previewFinalizationRecoveryUsed = false;
  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const calls = response.functionCalls ?? [];
    if (!calls.length) {
      const text = response.text?.trim();
      if (!previewWorkflowStarted && text) return { mode: 'message', message: text };
      if (previewWorkflowStarted && !previewFinalizationRecoveryUsed) {
        previewFinalizationRecoveryUsed = true;
        response = await withRetry(() => chat.sendMessage({
          message: [{ text: lastPreviewedCode
            ? 'A visual preview is an internal quality gate, not the final answer. Revise and preview again if needed, or call render_video with the exact reviewed code now. Do not claim completion in plain text or ask the user to inspect the preview.'
            : 'No preview has rendered successfully. Repair the TSX and call preview_video again. Do not claim the video exists or answer the user in plain text.' }],
        }));
        continue;
      }
      if (lastPreviewedCode) {
        return {
          mode: 'render',
          render: {
            code: lastPreviewedCode,
            message: 'Video created from the visually reviewed draft.',
          },
        };
      }
      if (!text && emptyResponseRecoveries < MAX_EMPTY_RESPONSE_RECOVERIES) {
        emptyResponseRecoveries += 1;
        response = await withRetry(() => chat.sendMessage({
          message: [{ text: 'Your previous response was empty. Continue the current request now. Treat the latest user message as an answer to any preceding question. Use reasonable creative judgment instead of repeating an answered or optional question.' }],
        }));
        continue;
      }
      if (previewWorkflowStarted) {
        throw Object.assign(new Error('The model did not complete the preview workflow. Please retry.'), { status: 502 });
      }
      throw Object.assign(new Error('The model returned an empty response after retrying. Please retry the generation.'), { status: 502 });
    }

    if (calls.length === 1 && calls[0].name === RENDER_TOOL_NAME) {
      const render = validateRenderArgs(calls[0].args ?? {});
      if (previewedCode.has(codeHash(render.code))) return { mode: 'render', render };
      previewWorkflowStarted = true;
      lastPreviewedCode = null;
      try {
        const image = await input.previewCode(render.code);
        previewedCode.add(codeHash(render.code));
        lastPreviewedCode = render.code;
        previewFinalizationRecoveryUsed = false;
        response = await withRetry(() => chat.sendMessage({
          message: [
            functionResponse(calls[0], {
              ok: true,
              previewOnly: true,
              finalized: false,
              width: image.width,
              height: image.height,
              frames: ['early (12%)', 'middle (50%)', 'late (88%)'],
              instruction: 'This was an automatic visual preview, not final rendering. Inspect the contact sheet, revise with preview_video if needed, or call render_video again with the exact reviewed code.',
            }),
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        }));
      } catch (error) {
        response = await withRetry(() => chat.sendMessage({
          message: [functionResponse(calls[0], {
            error: `Automatic preview failed. Repair the TSX and call preview_video. Renderer output:\n${errorText(error)}`,
          })],
        }));
      }
      continue;
    }

    if (calls.length === 1 && calls[0].name === PREVIEW_TOOL_NAME) {
      const preview = validatePreviewArgs(calls[0].args ?? {});
      previewWorkflowStarted = true;
      lastPreviewedCode = null;
      try {
        const image = await input.previewCode(preview.code);
        previewedCode.add(codeHash(preview.code));
        lastPreviewedCode = preview.code;
        previewFinalizationRecoveryUsed = false;
        response = await withRetry(() => chat.sendMessage({
          message: [
            functionResponse(calls[0], {
              ok: true,
              width: image.width,
              height: image.height,
              frames: ['early (12%)', 'middle (50%)', 'late (88%)'],
              instruction: 'Left-to-right contact sheet shows three actual frames. Check story progression, canvas use, subject scale, hierarchy, safe margins, aspect-ratio fit, accidental blank space, clipping, and visual naturalness. Revise if any check fails.',
            }),
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        }));
      } catch (error) {
        response = await withRetry(() => chat.sendMessage({
          message: [functionResponse(calls[0], {
            error: `Preview failed. Repair the TSX and call preview_video again. Renderer output:\n${errorText(error)}`,
          })],
        }));
      }
      continue;
    }

    // Inspect the whole batch before executing anything. If one action needs
    // approval, pause without partially executing sibling calls.
    for (const call of calls) {
      const found = findMcpTool(input.sessions, call.name ?? '');
      if (!found) continue;
      const requiresApproval = found.session.connection.approvalPolicy === 'always' || !found.tool.readOnly;
      if (!requiresApproval) continue;
      const reason = approvalReason(found.session.connection.name, found.tool);
      return {
        mode: 'approval',
        message: `I can continue by running “${found.tool.name}” on ${found.session.connection.name}. This needs your approval.`,
        request: {
          connectionId: found.session.connection.id,
          toolName: found.tool.name,
          arguments: call.args ?? {},
          reason,
        },
      };
    }

    const responses: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? '';
      const args = call.args ?? {};
      if (name === RENDER_TOOL_NAME) {
        responses.push(functionResponse(call, { error: 'Gather tool results first, then call render_video by itself.' }));
        continue;
      }
      if (name === PREVIEW_TOOL_NAME) {
        responses.push(functionResponse(call, { error: 'Call preview_video by itself after gathering other tool results.' }));
        continue;
      }

      const builtInResult = await executeBuiltInAgentTool(name, args, input.projectDir);
      if (builtInResult) {
        responses.push(functionResponse(call, builtInResult));
        continue;
      }

      const found = findMcpTool(input.sessions, name);
      if (!found) {
        responses.push(functionResponse(call, { error: 'Tool is unavailable for this turn.' }));
        continue;
      }

      const result = await found.session.callTool(found.tool.name, args, input.projectDir);
      responses.push(functionResponse(
        call,
        result.isError ? { error: result.output } : { output: result.output, assets: result.assets },
      ));
    }
    response = await withRetry(() => chat.sendMessage({ message: responses }));
  }

  if (lastPreviewedCode) {
    return {
      mode: 'render',
      render: {
        code: lastPreviewedCode,
        message: 'Video created from the visually reviewed draft.',
      },
    };
  }
  throw Object.assign(new Error('The model could not produce a reviewed video within the tool-step limit. Please retry.'), { status: 502 });
}
