import { env } from "../config.js";
import * as api from "./expenses-api.js";
import { callMcpTool } from "../mcp/client.js";

function useMcp() {
  return env.TOOLS_BACKEND === "mcp";
}

export async function listExpenses() {
  if (!useMcp()) return api.listExpenses();
  return callMcpTool("expenses.list", {});
}

export async function createExpense(input: {
  amount: number; date: string; currency?: string; category?: string; description?: string;
}) {
  if (!useMcp()) return api.createExpense(input);
  return callMcpTool("expenses.create", input);
}

export async function updateExpense(id: string, input: Record<string, unknown>) {
  if (!useMcp()) return api.updateExpense(id, input);
  return callMcpTool("expenses.update", { id, patch: input });
}

export async function deleteExpense(id: string) {
  if (!useMcp()) return api.deleteExpense(id);
  return callMcpTool("expenses.delete", { id });
}

export async function deleteAllExpenses(): Promise<{ deleted: number }> {
  const list = await listExpenses() as { id: string }[];
  const expenses = Array.isArray(list) ? list : ((list as { data?: { id: string }[] }).data ?? []);
  await Promise.all(expenses.map((e) => deleteExpense(e.id)));
  return { deleted: expenses.length };
}
