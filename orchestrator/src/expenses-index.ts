import { createHash } from "crypto";
import { embed } from "./embeddings.js";
import { env } from "./config.js";
import { listExpenses } from "./tools/expenses.js";

type Expense = {
  id: string;
  amount: number;
  currency?: string;
  category?: string;
  description?: string;
  date: string;
};

type Indexed = {
  expense: Expense;
  text: string;
  embedding: number[];
};

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function expenseToText(e: Expense) {
  const parts = [
    `Spesa ${e.amount} ${e.currency ?? ""}`.trim(),
    `data ${e.date}`,
    e.category ? `categoria ${e.category}` : "",
    e.description ? `descrizione ${e.description}` : ""
  ].filter(Boolean);
  return parts.join(", ");
}

function hashExpenses(expenses: Expense[]) {
  const json = JSON.stringify(expenses);
  return createHash("sha1").update(json).digest("hex");
}

export class ExpensesIndex {
  private cache: { hash: string; items: Indexed[] } | null = null;
  private lastLoadedAt = 0;

  async search(query: string, k = 5) {
    const items = await this.ensureIndex();
    if (!items.length) return [];

    const [qVec] = await embed([query]);
    return items
      .map(it => ({ ...it, score: cosine(qVec, it.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => ({ expense: x.expense, score: x.score, text: x.text }));
  }

  private async ensureIndex() {
    const now = Date.now();
    if (this.cache && (now - this.lastLoadedAt) < env.EXPENSES_CACHE_TTL_MS) {
      return this.cache.items;
    }

    let expenses: Expense[] = [];
    try {
      expenses = await listExpenses() as Expense[];
    } catch {
      this.lastLoadedAt = now;
      return this.cache?.items ?? [];
    }

    const hash = hashExpenses(expenses);
    if (this.cache && this.cache.hash === hash) {
      this.lastLoadedAt = now;
      return this.cache.items;
    }

    const texts = expenses.map(expenseToText);
    const vectors = texts.length ? await embed(texts) : [];
    const items = expenses.map((expense, i) => ({
      expense,
      text: texts[i],
      embedding: vectors[i] ?? []
    }));

    this.cache = { hash, items };
    this.lastLoadedAt = now;
    return items;
  }
}
