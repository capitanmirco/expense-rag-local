import { describe, it, expect } from "vitest";
import {
  normalize,
  hasAny,
  isExplicitOutOfScope,
  hasAmountHint,
  isExpenseHint,
  isDocHint,
  buildOutOfScopeReply,
  sanitizeReply,
  pickIntent,
  slugify,
  pdfTextToMarkdown,
  cosine,
  expenseToText,
  hashExpenses,
  type Expense,
} from "./utils.js";

// ─── normalize ────────────────────────────────────────────────────────────────

describe("normalize", () => {
  it("lowercases ASCII text", () => {
    expect(normalize("HELLO World")).toBe("hello world");
  });

  it("lowercases Italian accented characters", () => {
    expect(normalize("SPESA")).toBe("spesa");
  });

  it("returns empty string for empty input", () => {
    expect(normalize("")).toBe("");
  });
});

// ─── hasAny ───────────────────────────────────────────────────────────────────

describe("hasAny", () => {
  it("returns true when any keyword is present", () => {
    expect(hasAny("ho pagato la pizza", ["pizza", "pasta"])).toBe(true);
  });

  it("returns false when no keyword matches", () => {
    expect(hasAny("salsa di pomodoro", ["bitcoin", "meteo"])).toBe(false);
  });

  it("returns false for empty keywords list", () => {
    expect(hasAny("any text", [])).toBe(false);
  });
});

// ─── isExplicitOutOfScope ─────────────────────────────────────────────────────

describe("isExplicitOutOfScope", () => {
  it("detects 'calcio' as out of scope", () => {
    expect(isExplicitOutOfScope("chi ha vinto la partita di calcio?")).toBe(true);
  });

  it("does NOT flag 'bitcoin' as out of scope (handled via web.search)", () => {
    expect(isExplicitOutOfScope("quanto vale un bitcoin oggi?")).toBe(false);
  });

  it("detects 'ricette' as out of scope", () => {
    expect(isExplicitOutOfScope("hai ricette facili per la carbonara?")).toBe(true);
  });

  it("detects 'meteo' as out of scope", () => {
    expect(isExplicitOutOfScope("com'è il meteo a Milano?")).toBe(true);
  });

  it("does not flag expense-related text as out of scope", () => {
    expect(isExplicitOutOfScope("elenca le mie spese di novembre")).toBe(false);
  });
});

// ─── hasAmountHint ────────────────────────────────────────────────────────────

describe("hasAmountHint", () => {
  it("detects decimal amount with dot", () => {
    expect(hasAmountHint("ho speso 12.50")).toBe(true);
  });

  it("detects decimal amount with comma", () => {
    expect(hasAmountHint("12,99 euro")).toBe(true);
  });

  it("detects 'EUR' currency abbreviation", () => {
    expect(hasAmountHint("pagamento in EUR")).toBe(true);
  });

  it("detects 'euro' currency word", () => {
    expect(hasAmountHint("cinquanta euro")).toBe(true);
  });

  it("returns false for plain text without amount", () => {
    expect(hasAmountHint("ciao come stai")).toBe(false);
  });
});

// ─── isExpenseHint ────────────────────────────────────────────────────────────

describe("isExpenseHint", () => {
  it("detects 'spesa' keyword", () => {
    expect(isExpenseHint("elenca le mie spese")).toBe(true);
  });

  it("detects 'pagamento' keyword", () => {
    expect(isExpenseHint("ho registrato un pagamento")).toBe(true);
  });

  it("detects amount hint as expense hint", () => {
    expect(isExpenseHint("ho speso 10.00 euro")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(isExpenseHint("raccontami una storia")).toBe(false);
  });
});

// ─── isDocHint ────────────────────────────────────────────────────────────────

describe("isDocHint", () => {
  it("detects 'pdf' keyword", () => {
    expect(isDocHint("carica il pdf")).toBe(true);
  });

  it("detects 'fattura' keyword", () => {
    expect(isDocHint("dove è la fattura del fornitore?")).toBe(true);
  });

  it("detects 'contratto' keyword", () => {
    expect(isDocHint("mostrami il contratto")).toBe(true);
  });

  it("returns false for generic chat", () => {
    expect(isDocHint("come stai oggi?")).toBe(false);
  });
});

// ─── buildOutOfScopeReply ─────────────────────────────────────────────────────

describe("buildOutOfScopeReply", () => {
  it("includes the domain in the first line", () => {
    const reply = buildOutOfScopeReply("gestione spese");
    expect(reply).toContain("gestione spese");
  });

  it("contains example prompts", () => {
    const reply = buildOutOfScopeReply("demo");
    expect(reply).toContain("Elenca le mie spese");
  });
});

// ─── sanitizeReply ────────────────────────────────────────────────────────────

describe("sanitizeReply", () => {
  it("removes bold markdown (**text**)", () => {
    expect(sanitizeReply("Hello **World**")).toBe("Hello World");
  });

  it("removes bold markdown (__text__)", () => {
    expect(sanitizeReply("Hello __World__")).toBe("Hello World");
  });

  it("removes inline code (`text`)", () => {
    expect(sanitizeReply("Use `npm install`")).toBe("Use npm install");
  });

  it("normalizes bullet points with '•'", () => {
    const input = "• Item 1\n• Item 2";
    const output = sanitizeReply(input);
    expect(output).toBe("- Item 1\n- Item 2");
  });

  it("leaves plain text unchanged", () => {
    expect(sanitizeReply("plain text")).toBe("plain text");
  });
});

// ─── pickIntent ───────────────────────────────────────────────────────────────

describe("pickIntent", () => {
  it("returns 'expenses' when only expense hint is present", () => {
    expect(pickIntent({ expenseHint: true, docHint: false, expenseScore: 0, docScore: 0 }))
      .toBe("expenses");
  });

  it("returns 'documents' when only doc hint is present", () => {
    expect(pickIntent({ expenseHint: false, docHint: true, expenseScore: 0, docScore: 0 }))
      .toBe("documents");
  });

  it("returns 'expenses' when both hints present but only expense hint", () => {
    expect(pickIntent({ expenseHint: true, docHint: false, expenseScore: 0.5, docScore: 0.5 }))
      .toBe("expenses");
  });

  it("returns 'documents' when both hints present but only doc hint", () => {
    expect(pickIntent({ expenseHint: false, docHint: true, expenseScore: 0.5, docScore: 0.5 }))
      .toBe("documents");
  });

  it("returns 'expenses' when expense score clearly higher than doc score", () => {
    expect(pickIntent({
      expenseHint: true, docHint: true,
      expenseScore: 0.9, docScore: 0.3,
      intentDelta: 0.05
    })).toBe("expenses");
  });

  it("returns 'documents' when doc score clearly higher than expense score", () => {
    expect(pickIntent({
      expenseHint: true, docHint: true,
      expenseScore: 0.3, docScore: 0.9,
      intentDelta: 0.05
    })).toBe("documents");
  });

  it("returns 'clarify' when scores are too close with both hints", () => {
    expect(pickIntent({
      expenseHint: true, docHint: true,
      expenseScore: 0.5, docScore: 0.52,
      intentDelta: 0.05
    })).toBe("clarify");
  });

  it("returns 'unknown' when no hint and low scores", () => {
    expect(pickIntent({
      expenseHint: false, docHint: false,
      expenseScore: 0.1, docScore: 0.1,
      expensesMinScore: 0.2, docMinScore: 0.2
    })).toBe("unknown");
  });

  it("returns 'expenses' when expense score exceeds min threshold", () => {
    expect(pickIntent({
      expenseHint: false, docHint: false,
      expenseScore: 0.5, docScore: 0.0,
      expensesMinScore: 0.2
    })).toBe("expenses");
  });
});

// ─── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes consecutive non-alphanumeric characters", () => {
    expect(slugify("hello   world!!!")).toBe("hello-world");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("truncates at 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long)).toHaveLength(80);
  });

  it("converts Italian filename correctly", () => {
    expect(slugify("Fattura Supermercato 2026")).toBe("fattura-supermercato-2026");
  });
});

// ─── pdfTextToMarkdown ────────────────────────────────────────────────────────

describe("pdfTextToMarkdown", () => {
  it("starts with h1 title", () => {
    const md = pdfTextToMarkdown("My PDF", "Some content");
    expect(md.startsWith("# My PDF\n\n")).toBe(true);
  });

  it("uses fallback title when title is empty", () => {
    const md = pdfTextToMarkdown("", "content");
    expect(md).toContain("# Documento PDF");
  });

  it("joins multiple paragraphs separated by blank lines", () => {
    const md = pdfTextToMarkdown("Title", "Para 1\n\nPara 2");
    expect(md).toContain("Para 1\n\nPara 2");
  });

  it("trims whitespace inside paragraphs", () => {
    const md = pdfTextToMarkdown("Title", "  lots   of   spaces  ");
    expect(md).toContain("lots of spaces");
  });
});

// ─── cosine ───────────────────────────────────────────────────────────────────

describe("cosine", () => {
  it("returns 1.0 for identical unit vectors", () => {
    const v = [1, 0, 0];
    expect(cosine(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("handles unequal length vectors by trimming to shorter", () => {
    // only compares first element overlap
    expect(cosine([1, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });
});

// ─── expenseToText ────────────────────────────────────────────────────────────

describe("expenseToText", () => {
  it("produces a text with amount and date", () => {
    const e: Expense = { id: "1", amount: 12.5, date: "2026-01-01" };
    const text = expenseToText(e);
    expect(text).toContain("12.5");
    expect(text).toContain("2026-01-01");
  });

  it("includes category when present", () => {
    const e: Expense = { id: "1", amount: 10, date: "2026-01-01", category: "food" };
    expect(expenseToText(e)).toContain("categoria food");
  });

  it("includes description when present", () => {
    const e: Expense = { id: "1", amount: 10, date: "2026-01-01", description: "pranzo" };
    expect(expenseToText(e)).toContain("descrizione pranzo");
  });

  it("omits category when absent", () => {
    const e: Expense = { id: "1", amount: 10, date: "2026-01-01" };
    expect(expenseToText(e)).not.toContain("categoria");
  });

  it("includes currency when provided", () => {
    const e: Expense = { id: "1", amount: 10, date: "2026-01-01", currency: "USD" };
    expect(expenseToText(e)).toContain("USD");
  });
});

// ─── hashExpenses ─────────────────────────────────────────────────────────────

describe("hashExpenses", () => {
  it("returns a SHA1 hex string (40 chars)", () => {
    const hash = hashExpenses([]);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("returns same hash for same data", () => {
    const expenses: Expense[] = [{ id: "1", amount: 10, date: "2026-01-01" }];
    expect(hashExpenses(expenses)).toBe(hashExpenses(expenses));
  });

  it("returns different hash when data changes", () => {
    const a: Expense[] = [{ id: "1", amount: 10, date: "2026-01-01" }];
    const b: Expense[] = [{ id: "1", amount: 20, date: "2026-01-01" }];
    expect(hashExpenses(a)).not.toBe(hashExpenses(b));
  });
});
