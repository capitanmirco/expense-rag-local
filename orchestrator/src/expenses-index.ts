import { embed } from "./embeddings.js";
import { env } from "./config.js";
import { listExpenses } from "./tools/expenses.js";
import { cosine, expenseToText, hashExpenses, type Expense } from "./utils.js";

type Indexed = {
  expense: Expense;
  text: string;
  embedding: number[];
};

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
