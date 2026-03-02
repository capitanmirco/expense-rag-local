// Pure utility functions extracted from server.ts and expenses-index.ts
// All functions here are free of side effects and can be unit tested in isolation.

import { createHash } from "crypto";

// ─── Keyword dictionaries ─────────────────────────────────────────────────────

export const OUT_OF_SCOPE_KEYWORDS = [
  "calcio",
  "ricette",
  "meteo"
];

export const EXPENSE_KEYWORDS = [
  "spesa", "spese", "speso", "spendere",
  "movimenti", "transazioni", "uscite", "entrate",
  "acquisti", "pagamento", "rimborso", "rimborsi",
  "categoria", "valuta", "importo", "totale",
  "budget", "costo", "pagato", "pagamenti",
  "data", "descrizione"
];

export const DOC_KEYWORDS = [
  "pdf", "documento", "documenti", "manuale", "policy",
  "contratto", "allegato", "fattura", "ricevuta", "regolamento"
];

export const WEB_FINANCE_KEYWORDS = [
  "risparmio", "risparmi", "risparmiare", "risparmiatore",
  "finanza", "finanziario", "economia", "economico",
  "investimento", "investire", "investimenti",
  "inflazione", "tasso", "interessi",
  "mutuo", "prestito", "prestiti", "finanziamento",
  "banca", "bancario", "conto corrente",
  "stipendio", "salario", "reddito", "pensione",
  "tasse", "iva", "detrazioni", "imu", "irpef",
  "bolletta", "utenze", "affitto", "assicurazione", "polizza",
  "borsa", "azioni", "obbligazioni", "etf", "fondo",
  "rendimento", "dividendo", "portafoglio",
  "bitcoin", "criptovalute", "crypto",
  "valuta", "cambio", "euro", "dollaro",
  "prezzo", "prezzi", "rincaro", "costo della vita",
  "consumi", "consumo", "potere d'acquisto"
];

export function isFinanceWebHint(text: string): boolean {
  return hasAny(normalize(text), WEB_FINANCE_KEYWORDS);
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text.toLowerCase();
}

export function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

export function isExplicitOutOfScope(text: string): boolean {
  return hasAny(normalize(text), OUT_OF_SCOPE_KEYWORDS);
}

export function hasAmountHint(text: string): boolean {
  return /\b\d+[.,]\d{1,2}\b/.test(text) || /\b(eur|usd|gbp|euro|dollari|sterline)\b/i.test(text);
}

export function isExpenseHint(text: string): boolean {
  const t = normalize(text);
  return hasAny(t, EXPENSE_KEYWORDS) || hasAmountHint(t);
}

export function isDocHint(text: string): boolean {
  return hasAny(normalize(text), DOC_KEYWORDS);
}

export function buildOutOfScopeReply(domain: string): string {
  return [
    `Sono un assistente demo per ${domain}. Posso aiutarti sulle funzioni dell'app e sulla gestione delle spese.`,
    "Per domande fuori perimetro (es. argomenti generici non legati all'app) non posso rispondere.",
    "Esempi: \"Elenca le mie spese\" oppure \"Aggiungi una spesa\""
  ].join("\n");
}

export function sanitizeReply(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[\t ]*[*•–—]\s+/gm, "- ");
}

export type Intent = "expenses" | "documents" | "web" | "clarify" | "unknown";

export interface PickIntentOptions {
  expenseHint: boolean;
  docHint: boolean;
  expenseScore: number;
  docScore: number;
  intentDelta?: number;
  expensesMinScore?: number;
  docMinScore?: number;
}

export function pickIntent(opts: PickIntentOptions): Intent {
  const {
    expenseHint,
    docHint,
    expenseScore,
    docScore,
    intentDelta = 0.05,
    expensesMinScore = 0.2,
    docMinScore = 0.2
  } = opts;

  const expenseLikely = expenseHint || expenseScore >= expensesMinScore;
  const docLikely = docHint || docScore >= docMinScore;

  if (expenseLikely && docLikely) {
    if (expenseHint && !docHint) return "expenses";
    if (docHint && !expenseHint) return "documents";
    const delta = Math.abs(expenseScore - docScore);
    if (delta >= intentDelta) {
      return expenseScore >= docScore ? "expenses" : "documents";
    }
    return "clarify";
  }

  if (expenseLikely) return "expenses";
  if (docLikely) return "documents";
  return "unknown";
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(?:^-+|-+$)/g, "")
    .slice(0, 80);
}

export function pdfTextToMarkdown(title: string, text: string): string {
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/g)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const body = paragraphs.length ? paragraphs.join("\n\n") : text.trim();
  const safeTitle = title.trim() || "Documento PDF";
  return `# ${safeTitle}\n\n${body}\n`;
}

// ─── Expense index helpers ────────────────────────────────────────────────────

export type Expense = {
  id: string;
  amount: number;
  currency?: string;
  category?: string;
  description?: string;
  date: string;
};

export function cosine(a: number[], b: number[]): number {
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

export function expenseToText(e: Expense): string {
  const parts = [
    `Spesa ${e.amount} ${e.currency ?? ""}`.trim(),
    `data ${e.date}`,
    e.category ? `categoria ${e.category}` : "",
    e.description ? `descrizione ${e.description}` : ""
  ].filter(Boolean);
  return parts.join(", ");
}

export function hashExpenses(expenses: Expense[]): string {
  const json = JSON.stringify(expenses);
  return createHash("sha1").update(json).digest("hex");
}
