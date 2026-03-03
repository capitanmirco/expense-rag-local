import { env } from "../config.js";

const FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

export async function listExpenses() {
  const r = await fetchWithTimeout(`${env.API_BASE_URL}/expenses`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function createExpense(input: {
  amount: number; date: string; currency?: string; category?: string; description?: string;
}) {
  const r = await fetchWithTimeout(`${env.API_BASE_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function updateExpense(id: string, input: Record<string, unknown>) {
  const r = await fetchWithTimeout(`${env.API_BASE_URL}/expenses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function deleteExpense(id: string) {
  const r = await fetchWithTimeout(`${env.API_BASE_URL}/expenses/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}
