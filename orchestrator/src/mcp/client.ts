import { randomUUID } from "crypto";
import { env } from "../config.js";

const MCP_TIMEOUT_MS = 10_000;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

async function rpc(method: string, params?: Record<string, unknown>) {
  const id = randomUUID();
  const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  let r: Response;
  try {
    r = await fetch(env.MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) throw new Error(`MCP HTTP error: ${r.status}`);

  const data = await r.json() as JsonRpcResponse;
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message ?? "unknown"}`);
  }
  return data.result;
}

type ToolContent = { type: string; json?: unknown };
type ToolResult = { content?: ToolContent[] } | unknown;

function unwrapToolResult(result: ToolResult) {
  if (!result) return result;
  const r = result as { content?: ToolContent[] };
  if (Array.isArray(r.content)) {
    const jsonPart = r.content.find(c => c?.type === "json");
    if (jsonPart && jsonPart.json !== undefined) return jsonPart.json;
  }
  return result;
}

export async function callMcpTool(name: string, args: Record<string, unknown>) {
  const result = await rpc("tools/call", { name, arguments: args });
  return unwrapToolResult(result);
}
