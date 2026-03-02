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
import { createVectorStore } from "./vectorstore/index.js";
import { listExpenses, createExpense, updateExpense, deleteExpense } from "./tools/expenses.js";
import { ExpensesIndex } from "./expenses-index.js";
import {
  isExplicitOutOfScope,
  isExpenseHint,
  isDocHint,
  buildOutOfScopeReply,
  sanitizeReply,
  pickIntent,
  slugify,
  pdfTextToMarkdown,
} from "./utils.js";

const app = express();
app.use(cors({ origin: ["http://localhost:4200"] }));
app.use(express.json({ limit: "1mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

function getDataDir() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "..", "data");
}

const store = await createVectorStore();
const expensesIndex = new ExpensesIndex();

app.get("/health", (_, res) => res.json({ ok: true, vectorStore: env.VECTOR_STORE }));

app.post("/rag/search", async (req, res) => {
  const schema = z.object({
    query: z.string().min(1),
    k: z.coerce.number().min(1).max(20).optional(),
    filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  });

  const body = schema.parse(req.body);
  const results = await store.query(body.query, body.k ?? 5, body.filter ? { filter: body.filter } : undefined);
  res.json({ results });
});

app.post("/rag/ingest", async (req, res) => {
  const schema = z.object({
    docs: z.array(z.object({
      id: z.string(),
      text: z.string(),
      meta: z.record(z.any()).optional()
    }))
  });

  const body = schema.parse(req.body);
  const out = await store.upsert(body.docs);
  res.json(out);
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

    const docsDir = path.join(getDataDir(), "markdown");
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
  const schema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string()
    }))
  });

  const body = schema.parse(req.body);
  const lastUser = [...body.messages].reverse().find(m => m.role === "user")?.content ?? "";

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

  const intent = pickIntent({
    expenseHint, docHint, expenseScore, docScore,
    intentDelta: env.INTENT_DELTA,
    expensesMinScore: env.EXPENSES_MIN_SCORE,
    docMinScore: env.DOC_MIN_SCORE
  });

  if (intent === "unknown") {
    return res.json({ reply: outOfScopeReply, sources: [] });
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
- Se intento = "expenses": usa i tool spese per leggere o modificare i dati. Non usare CONTENUTO DOCUMENTI.
- Se intento = "documents": rispondi SOLO usando CONTENUTO DOCUMENTI. Non usare tool spese.

REGOLE DI PERIMETRO:
- Rispondi solo se la domanda riguarda ${env.SCOPE_DOMAIN} o le funzioni dell'app demo.
- Usa solo il CONTENUTO DOCUMENTI (quando presente) e gli eventuali "Tool result".
- Se il CONTENUTO DOCUMENTI e vuoto o non pertinente, chiedi chiarimenti o spiega che non hai info nel perimetro.
- La demo include una sezione "Spese": usa i tool per elencare, creare, aggiornare o cancellare spese.

REGOLE TOOL:
- Se serve usare i tool, rispondi ESCLUSIVAMENTE con un JSON su una singola riga:
  {"tool":"expenses.list","args":{}}
  {"tool":"expenses.create","args":{"amount":12.34,"date":"2026-01-27","currency":"EUR","category":"food","description":"pizza"}}
  {"tool":"expenses.update","args":{"id":"...","patch":{...}}}
  {"tool":"expenses.delete","args":{"id":"..."}}
- Se ricevi un messaggio che inizia con "Tool result", NON chiamare altri tool.
- In quel caso produci la risposta finale per l'utente: linguaggio semplice e naturale, niente JSON, niente dettagli tecnici (tool, API, database) se non richiesti.
- Riassumi l'esito in modo chiaro e, se utile, proponi la prossima azione con una domanda breve.
- Altrimenti rispondi normalmente.

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

  const toolCallSchema = z.object({
    tool: z.enum(["expenses.list", "expenses.create", "expenses.update", "expenses.delete"]),
    args: z.record(z.any()).default({})
  });

  async function runToolAndReply(toolName: string, toolFn: () => Promise<unknown>) {
    const data = await toolFn();
    console.log(`[chat] tool executed: ${toolName}`);
    const final = await chat([
      { role: "system", content: system },
      ...body.messages.map(m => ({ role: m.role, content: m.content })),
      { role: "assistant", content: `Tool result (${toolName}): ${JSON.stringify(data)}` }
    ]);
    return res.json({ reply: sanitizeReply(final), sources });
  }

  const t0 = Date.now();
  const draft = await chat([
    { role: "system", content: system },
    ...body.messages.map(m => ({ role: m.role, content: m.content })),
  ]);
  console.log(`[chat] LLM first call: ${Date.now() - t0}ms, intent=${intent}`);

  const maybe = draft.trim();
  if (intent === "expenses" && maybe.startsWith("{") && maybe.endsWith("}")) {
    try {
      const call = toolCallSchema.parse(JSON.parse(maybe));

      if (call.tool === "expenses.list") return runToolAndReply("expenses.list", () => listExpenses());
      if (call.tool === "expenses.create") return runToolAndReply("expenses.create", () => createExpense(call.args as { amount: number; date: string; currency?: string; category?: string; description?: string }));
      if (call.tool === "expenses.update") return runToolAndReply("expenses.update", () => updateExpense(call.args.id, call.args.patch));
      if (call.tool === "expenses.delete") return runToolAndReply("expenses.delete", () => deleteExpense(call.args.id));
    } catch (err) {
      console.error("[chat] tool JSON parse/exec error", err);
    }
  }

  res.json({ reply: sanitizeReply(draft), sources });
});

app.listen(env.PORT, () => {
  console.log(`Orchestrator listening on http://localhost:${env.PORT}`);
});
