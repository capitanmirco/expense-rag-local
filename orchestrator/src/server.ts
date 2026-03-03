import express from "express";
import cors from "cors";
import { z } from "zod";
import multer from "multer";
import pdfParse from "pdf-parse";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { env } from "./config.js";
import { chat } from "./llm.js";
import { listCopilotModels, getCopilotQuota } from "./llm-copilot.js";
import { createVectorStore } from "./vectorstore/index.js";
import { listExpenses, createExpense, updateExpense, deleteExpense, deleteAllExpenses } from "./tools/expenses.js";
import { ExpensesIndex } from "./expenses-index.js";
import {
  isExplicitOutOfScope,
  isExpenseHint,
  isDocHint,
  isFinanceWebHint,
  buildOutOfScopeReply,
  sanitizeReply,
  pickIntent,
  slugify,
  pdfTextToMarkdown,
} from "./utils.js";
import { webSearch } from "./tools/web-search.js";

const app = express();
app.use(cors({ origin: ["http://localhost:4200"] }));
app.use(express.json({ limit: "1mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const ragSearchSchema = z.object({
  query: z.string().min(1),
  k: z.coerce.number().min(1).max(20).optional(),
  filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

const ragIngestSchema = z.object({
  docs: z.array(z.object({
    id: z.string(),
    text: z.string(),
    meta: z.record(z.any()).optional()
  }))
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })),
  model: z.string().optional()
});

const toolCallSchema = z.object({
  tool: z.enum(["expenses.list", "expenses.create", "expenses.update", "expenses.delete", "expenses.deleteAll", "web.search"]),
  args: z.record(z.any()).default({})
});

const MUTATING_TOOLS = new Set([
  "expenses.create", "expenses.update", "expenses.delete", "expenses.deleteAll"
]);

type WorkingMsg = { role: "system" | "user" | "assistant"; content: string };

async function executeTool(call: { tool: string; args: Record<string, unknown> }): Promise<unknown> {
  switch (call.tool) {
    case "expenses.list":      return listExpenses();
    case "expenses.create":    return createExpense(call.args as { amount: number; date: string; currency?: string; category?: string; description?: string });
    case "expenses.update":    return updateExpense(call.args.id as string, call.args.patch as Record<string, unknown>);
    case "expenses.delete":    return deleteExpense(call.args.id as string);
    case "expenses.deleteAll": return deleteAllExpenses();
    case "web.search":         return webSearch(call.args.query as string);
    default:                   return { error: `Tool sconosciuto: ${call.tool}` };
  }
}

async function runToolLoop(
  initialMsgs: WorkingMsg[],
  system: string,
  model: string | undefined,
  intent: string
): Promise<{ finalReply: string; expensesChanged: boolean }> {
  const MAX_TOOL_STEPS = 4;
  let workingMsgs = initialMsgs;
  let expensesChanged = false;
  let finalReply = "";

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const t0 = Date.now();
    const draft = await chat([{ role: "system", content: system }, ...workingMsgs], model);
    console.log(`[chat] LLM step ${step + 1}/${MAX_TOOL_STEPS}: ${Date.now() - t0}ms, intent=${intent}`);

    const jsonStr = intent === "documents" ? null : extractToolCallJson(draft);
    if (!jsonStr) { finalReply = draft; break; }

    let toolCall: { tool: string; args: Record<string, unknown> };
    try {
      toolCall = toolCallSchema.parse(JSON.parse(jsonStr));
    } catch {
      finalReply = draft;
      break;
    }

    let toolResult: unknown;
    try {
      toolResult = await executeTool(toolCall);
      console.log(`[chat] tool executed: ${toolCall.tool}`);
    } catch (err) {
      console.error(`[chat] tool error (${toolCall.tool}):`, err);
      toolResult = { error: String(err) };
    }

    if (MUTATING_TOOLS.has(toolCall.tool)) expensesChanged = true;

    workingMsgs = [
      ...workingMsgs,
      { role: "assistant", content: `{"tool":"${toolCall.tool}","args":${JSON.stringify(toolCall.args)}}` },
      { role: "user", content: `Tool result (${toolCall.tool}): ${JSON.stringify(toolResult)}` }
    ];
  }

  if (!finalReply) {
    console.warn("[chat] max tool steps reached, forcing final response");
    finalReply = await chat([{ role: "system", content: system }, ...workingMsgs], model);
  }

  return { finalReply, expensesChanged };
}

/**
 * Estrae il primo oggetto JSON contenente la chiave "tool" dal testo.
 * Gestisce il caso in cui l'LLM includa testo libero prima/dopo il JSON.
 */
function extractToolCallJson(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let j = i;
    while (j < text.length) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (depth !== 0) break;
    const candidate = text.slice(i, j + 1);
    if (candidate.includes('"tool"')) return candidate;
  }
  return null;
}

const store = await createVectorStore();
const expensesIndex = new ExpensesIndex();

app.get("/health", (_, res) => res.json({ ok: true, vectorStore: env.VECTOR_STORE }));

app.get("/models", async (_, res) => {
  if (env.LLM_PROVIDER !== "copilot") {
    return res.json({ models: [] });
  }
  try {
    const raw = await listCopilotModels();
    const models = raw.map(m => ({
      id: m.id,
      name: m.name,
      multiplier: m.billing?.multiplier ?? 1,
      policy: m.policy?.state ?? "enabled"
    }));
    res.json({ models });
  } catch (err) {
    console.error("[models] listModels error", err);
    res.json({ models: [] });
  }
});

app.get("/quota", async (_, res) => {
  if (env.LLM_PROVIDER !== "copilot") {
    return res.json({ quotaSnapshots: {} });
  }
  try {
    const result = await getCopilotQuota();
    res.json(result);
  } catch (err) {
    console.error("[quota] error", err);
    res.json({ quotaSnapshots: {} });
  }
});

app.post("/rag/search", async (req, res) => {
  try {
    const body = ragSearchSchema.parse(req.body);
    const results = await store.query(body.query, body.k ?? 5, body.filter ? { filter: body.filter } : undefined);
    res.json({ results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Parametri non validi.", details: err.issues });
    }
    console.error("[rag/search] error", err);
    res.status(500).json({ error: "Errore durante la ricerca RAG." });
  }
});

app.post("/rag/ingest", async (req, res) => {
  try {
    const body = ragIngestSchema.parse(req.body);
    const out = await store.upsert(body.docs);
    res.json(out);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Parametri non validi.", details: err.issues });
    }
    console.error("[rag/ingest] error", err);
    res.status(500).json({ error: "Errore durante l'ingestione RAG." });
  }
});

app.post("/rag/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File mancante (campo 'file')." });
  }

  if (req.file.mimetype !== "application/pdf") {
    return res.status(415).json({ error: "Formato non supportato. Carica un PDF." });
  }

  try {
    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text?.trim() ?? "";

    if (!text) {
      return res.status(422).json({ error: "PDF senza testo estraibile." });
    }

    const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const slug = slugify(baseName) || "documento";
    const docId = randomUUID();
    const mdFile = `${slug}-${docId.slice(0, 8)}.md`;
    const markdown = pdfTextToMarkdown(baseName, text);

    const docsDir = path.join(DATA_DIR, "markdown");
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(path.join(docsDir, mdFile), markdown, "utf-8");

    const meta = {
      sourceType: "pdf",
      source: mdFile,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      createdAt: new Date().toISOString()
    };

    const out = await store.upsert([{ id: docId, text: markdown, meta }]);
    res.json({ ok: true, chunks: out.chunks, mdFile, docId });
  } catch (err) {
    console.error("[rag/upload] error", err);
    res.status(500).json({ error: "Errore durante il parsing del PDF." });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const body = chatSchema.parse(req.body);
    const lastUser = body.messages.findLast(m => m.role === "user")?.content ?? "";

  const outOfScopeReply = buildOutOfScopeReply(env.SCOPE_DOMAIN);
  if (isExplicitOutOfScope(lastUser)) {
    return res.json({ reply: outOfScopeReply, sources: [] });
  }

  const expenseHint = isExpenseHint(lastUser);
  const docHint = isDocHint(lastUser);

  const docFilter = docHint ? { sourceType: "pdf" } : undefined;
  const expenseSearch = env.EXPENSES_K > 0
    ? expensesIndex.search(lastUser, env.EXPENSES_K)
    : Promise.resolve([] as { expense: any; score: number; text: string }[]);

  const [docCtx, expenseMatches] = await Promise.all([
    store.query(lastUser, env.DOC_K, docFilter ? { filter: docFilter } : undefined),
    expenseSearch
  ]);

  const docScore = docCtx[0]?.score ?? 0;
  const expenseScore = expenseMatches[0]?.score ?? 0;

  let intent = pickIntent({
    expenseHint, docHint, expenseScore, docScore,
    intentDelta: env.INTENT_DELTA,
    expensesMinScore: env.EXPENSES_MIN_SCORE,
    docMinScore: env.DOC_MIN_SCORE
  });

  // Promuove "unknown" → "web" per query su finanza/risparmio/economia
  if (intent === "unknown") {
    if (isFinanceWebHint(lastUser)) {
      intent = "web";
    } else {
      return res.json({ reply: outOfScopeReply, sources: [] });
    }
  }

  if (intent === "clarify") {
    return res.json({
      reply: [
        "Per risponderti correttamente ho bisogno di capire il contesto.",
        "Vuoi informazioni sulle spese nel database oppure sul contenuto dei PDF caricati?"
      ].join("\n"),
      sources: []
    });
  }

  if (intent === "documents" && docCtx.length === 0) {
    return res.json({
      reply: docHint
        ? "Non ho documenti PDF caricati o il contenuto non e disponibile. Carica un PDF e riprova."
        : "Non ho documenti disponibili o il contenuto non e accessibile. Carica un PDF o fornisci nuove informazioni.",
      sources: []
    });
  }

  const docContext = intent === "documents" ? docCtx : [];
  const contextBlock = docContext.map((d, i) => {
    const source = d.meta?.source ?? d.meta?.sourceId ?? "documento";
    return `[#${i + 1} score=${d.score.toFixed(3)} source=${source}] ${d.text}`;
  }).join("\n\n");

  const system = `
Sei un assistente demo per ${env.SCOPE_DOMAIN}.
Aiuti gli utenti a usare l'app e a gestire le spese personali nel perimetro della demo.
Se la domanda e fuori perimetro, rifiuta con cortesia e spiega cosa puoi fare.

ROUTER (intento selezionato):
- Intento: ${intent}
- Se intento = "expenses": usa i tool spese per leggere o modificare i dati. Puoi usare web.search per contesto finanziario se utile. Non usare CONTENUTO DOCUMENTI.
- Se intento = "web": usa web.search per cercare informazioni finanziarie. Puoi anche usare i tool spese se l'utente vuole aggiornare il database.
- Se intento = "documents": rispondi SOLO usando CONTENUTO DOCUMENTI. Non usare tool spese n\u00e9 web.search.

REGOLE DI PERIMETRO:
- Rispondi solo se la domanda riguarda ${env.SCOPE_DOMAIN} o le funzioni dell'app demo.
- Usa solo il CONTENUTO DOCUMENTI (quando presente) e gli eventuali "Tool result".
- Se il CONTENUTO DOCUMENTI e vuoto o non pertinente, chiedi chiarimenti o spiega che non hai info nel perimetro.
- La demo include una sezione "Spese": usa i tool per elencare, creare, aggiornare o cancellare spese.

REGOLE TOOL:
- Se serve usare i tool, rispondi ESCLUSIVAMENTE con un JSON su una singola riga (nessun testo prima o dopo):
  {"tool":"expenses.list","args":{}}
  {"tool":"expenses.create","args":{"amount":12.34,"date":"2026-01-27","currency":"EUR","category":"food","description":"pizza"}}
  {"tool":"expenses.update","args":{"id":"...","patch":{...}}}
  {"tool":"expenses.delete","args":{"id":"..."}}
  {"tool":"expenses.deleteAll","args":{}}
  {"tool":"web.search","args":{"query":"inflazione Italia 2025"}}
- Usa expenses.deleteAll quando l'utente vuole eliminare tutte le spese in una sola operazione.
- NON usare expenses.list seguito da expenses.delete ciclicamente: usa direttamente expenses.deleteAll.
- Usa web.search per domande su finanza, risparmio, investimenti, inflazione, tasse, mutui, valute o economia che non trovano risposta nel database spese o nei documenti.
- web.search è limitato a temi finanziari: risparmio, budget, economia, banche, investimenti, ecc. Non usarla per argomenti fuori perimetro.
- Puoi chiamare più tool in sequenza: ogni risposta "Tool result" ti permette di fare un'altra chiamata o di rispondere all'utente.
- Quando hai abbastanza informazioni, NON chiamare altri tool: produci la risposta finale per l'utente.
- Risposta finale: linguaggio semplice e naturale, niente JSON, niente dettagli tecnici (tool, API, database) se non richiesti.
- Riassumi l'esito in modo chiaro e, se utile, proponi la prossima azione con una domanda breve.

FORMATO RISPOSTA (solo quando NON usi i tool):
- Scegli il formato in base alla domanda:
  - Discorsivo: quando spieghi, dai contesto o fai ragionamenti.
  - Elenco puntato: quando presenti opzioni, consigli, esempi o categorie.
  - Elenco numerato: quando descrivi passi o procedure in ordine.
- Se serve, usa una breve frase introduttiva e poi l'elenco.
- Usa righe vuote tra paragrafi o sezioni.
- Per sottopunti usa 2 spazi di rientro.
- Evita markdown: niente grassetto, corsivo, codice o tabelle; usa testo semplice.
- Non comprimere tutto su una riga.

CONTENUTO DOCUMENTI:
${contextBlock || "(vuoto)"}
`.trim();

  const sources = docContext.map(c => c.meta);
  const msgs = body.messages.map(m => ({ role: m.role, content: m.content })) as WorkingMsg[];

  const { finalReply, expensesChanged } = await runToolLoop(msgs, system, body.model, intent);

  return res.json({ reply: sanitizeReply(finalReply), sources, expensesChanged });
  } catch (err) {
    console.error("[chat] unhandled error", err);
    res.status(500).json({ error: "Errore interno del server. Riprova." });
  }
});

app.listen(env.PORT, () => {
  console.log(`Orchestrator listening on http://localhost:${env.PORT}`);
});
