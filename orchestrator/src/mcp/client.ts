import { randomUUID } from "crypto";
import { env } from "../config.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: any;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: any;
  error?: { code?: number; message?: string; data?: any };
};

async function rpc(method: string, params?: any) {
  const id = randomUUID();
  const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

  const r = await fetch(env.MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(`MCP HTTP error: ${r.status}`);

  const data = await r.json() as JsonRpcResponse;
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message ?? "unknown"}`);
  }
  return data.result;
}

function unwrapToolResult(result: any) {
  if (!result) return result;
  if (Array.isArray(result.content)) {
    const jsonPart = result.content.find((c: any) => c?.type === "json");
    if (jsonPart && jsonPart.json !== undefined) return jsonPart.json;
  }
  return result;
}

export async function callMcpTool(name: string, args: any) {
  const result = await rpc("tools/call", { name, arguments: args });
  return unwrapToolResult(result);
}
