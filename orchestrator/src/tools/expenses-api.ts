import { env } from "../config.js";

export async function listExpenses() {
  const r = await fetch(`${env.API_BASE_URL}/expenses`);
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function createExpense(input: {
  amount: number; date: string; currency?: string; category?: string; description?: string;
}) {
  const r = await fetch(`${env.API_BASE_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function updateExpense(id: string, input: any) {
  const r = await fetch(`${env.API_BASE_URL}/expenses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}

export async function deleteExpense(id: string) {
  const r = await fetch(`${env.API_BASE_URL}/expenses/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
}
