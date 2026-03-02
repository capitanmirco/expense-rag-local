import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { embed } from "../embeddings.js";
import type { VectorStore, RetrievedChunk } from "./types.js";
import { randomUUID } from "crypto";

type Stored = {
  id: string;
  text: string;
  meta: Record<string, any>;
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

function chunkText(text: string, maxChars = 900): string[] {
  const paras = text.split(/\n{2,}/g).map(s => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";

  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxChars) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? (buf + "\n\n" + p) : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export class LocalStore implements VectorStore {
  private filePath: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.filePath = path.join(__dirname, "..", "..", "data", "local-vectors.json");
  }

  private async load(): Promise<Stored[]> {
    try {
      const txt = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(txt) as Stored[];
    } catch {
      return [];
    }
  }

  private async save(items: Stored[]) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2), "utf-8");
  }

  async upsert(docs: { id: string; text: string; meta?: Record<string, any> }[]) {
    const items = await this.load();

    const newTexts: string[] = [];
    const newMetas: Record<string, any>[] = [];

    for (const d of docs) {
      for (const c of chunkText(d.text)) {
        newTexts.push(c);
        newMetas.push({ ...(d.meta ?? {}), sourceId: d.id });
      }
    }

    const vectors = await embed(newTexts);

    for (let i = 0; i < newTexts.length; i++) {
      items.push({
        id: randomUUID(),
        text: newTexts[i],
        meta: newMetas[i],
        embedding: vectors[i]
      });
    }

    await this.save(items);
    return { chunks: newTexts.length };
  }

  async query(queryText: string, k: number, options?: { filter?: Record<string, string | number | boolean> }): Promise<RetrievedChunk[]> {
    const items = await this.load();
    if (!items.length) return [];

    const filter = options?.filter;
    const filtered = filter
      ? items.filter(it => Object.entries(filter).every(([key, value]) => it.meta?.[key] === value))
      : items;
    if (!filtered.length) return [];

    const [qVec] = await embed([queryText]);

    const ranked = filtered
      .map(it => ({ it, score: cosine(qVec, it.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => ({ text: x.it.text, meta: x.it.meta, score: x.score }));

    return ranked;
  }
}
