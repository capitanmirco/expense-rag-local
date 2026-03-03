/**
 * Web search tool — limitato al dominio finanziario/risparmio.
 *
 * Provider (scelto automaticamente):
 *  - Brave Search API  → se WEBSEARCH_API_KEY è impostato nel .env
 *    Free tier: 2 000 query/mese — https://api.search.brave.com
 *  - DuckDuckGo Instant Answer API → fallback gratuito senza chiave
 *    (risponde bene a domande fattuali; meno completo per ricerche generali)
 */
import { env } from "../config.js";
import { isFinanceWebHint } from "../utils.js";

const WEBSEARCH_TIMEOUT_MS = 8_000;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOk {
  results: WebSearchResult[];
  source: "brave" | "duckduckgo";
  query: string;
}

export interface WebSearchError {
  error: string;
  query: string;
}

export type WebSearchResponse = WebSearchOk | WebSearchError;

// ─── Brave Search ─────────────────────────────────────────────────────────────

async function braveSearch(query: string, count = 5): Promise<WebSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("search_lang", "it");
  url.searchParams.set("country", "IT");
  url.searchParams.set("freshness", "pweek"); // ultimi 7 giorni preferiti

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSEARCH_TIMEOUT_MS);

  let r: Response;
  try {
    r = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": env.WEBSEARCH_API_KEY
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Brave Search error ${r.status}: ${body.slice(0, 200)}`);
  }

  const data = await r.json() as {
    web?: { results?: { title?: string; url?: string; description?: string }[] }
  };

  return (data.web?.results ?? []).slice(0, count).map(item => ({
    title: item.title ?? "",
    url: item.url ?? "",
    snippet: item.description ?? ""
  }));
}

// ─── DuckDuckGo Instant Answer (fallback no-key) ──────────────────────────────

async function duckduckgoSearch(query: string): Promise<WebSearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=it-it`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSEARCH_TIMEOUT_MS);

  let r: Response;
  try {
    r = await fetch(url, {
      headers: { "User-Agent": "expense-rag-local/1.0 (finance assistant)" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) throw new Error(`DuckDuckGo API error: ${r.status}`);

  const data = await r.json() as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: { Text?: string; FirstURL?: string; Topics?: unknown[] }[];
  };

  const results: WebSearchResult[] = [];

  if (data.AbstractText) {
    results.push({
      title: data.Heading ?? query,
      url: data.AbstractURL ?? "",
      snippet: data.AbstractText
    });
  }

  for (const topic of (data.RelatedTopics ?? []).slice(0, 5)) {
    if (topic.Topics) continue; // salta i gruppi senza snippet diretto
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.slice(0, 100),
        url: topic.FirstURL,
        snippet: topic.Text
      });
    }
  }

  return results.slice(0, 5);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Esegue una ricerca web limitata al dominio finanziario/risparmio.
 * Ritorna i risultati o un oggetto error se la query è fuori perimetro.
 */
export async function webSearch(query: string): Promise<WebSearchResponse> {
  if (!query?.trim()) {
    return { error: "Query vuota.", query: query ?? "" };
  }

  // Domain gate: blocca argomenti non finanziari
  if (!isFinanceWebHint(query)) {
    return {
      error: "Ricerca non consentita: la query riguarda un argomento fuori dal perimetro finanziario. Posso cercare su temi come risparmio, budget, inflazione, mutui, tasse, valute, investimenti, ecc.",
      query
    };
  }

  try {
    if (env.WEBSEARCH_API_KEY) {
      const results = await braveSearch(query);
      console.log(`[web-search] Brave: ${results.length} risultati per "${query}"`);
      return { results, source: "brave", query };
    } else {
      const results = await duckduckgoSearch(query);
      console.log(`[web-search] DuckDuckGo: ${results.length} risultati per "${query}"`);
      return { results, source: "duckduckgo", query };
    }
  } catch (err) {
    console.error("[web-search] error:", err);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return { error: isTimeout ? "Timeout durante la ricerca web." : "Errore durante la ricerca web. Riprova più tardi.", query };
  }
}
