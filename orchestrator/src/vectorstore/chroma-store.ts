import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import { env } from "../config.js";
import { embed } from "../embeddings.js";
import type { VectorStore, RetrievedChunk } from "./types.js";
import { randomUUID } from "crypto";

let chromaEmbedder: DefaultEmbeddingFunction | null = null;

function getChromaEmbeddingFunction() {
  if (env.EMBEDDINGS_PROVIDER !== "default-embed") return undefined;
  if (!chromaEmbedder) {
    const modelName = env.EMBEDDINGS_MODEL?.trim();
    chromaEmbedder = modelName ? new DefaultEmbeddingFunction({ modelName }) : new DefaultEmbeddingFunction();
  }
  return chromaEmbedder;
}

function parseChromaUrl(raw: string) {
  try {
    return new URL(raw);
  } catch {
    return new URL(`http://${raw}`);
  }
}

function getChromaClientArgs() {
  const url = parseChromaUrl(env.CHROMA_URL);
  const ssl = url.protocol === "https:";
  const port = url.port ? Number(url.port) : (ssl ? 443 : 80);
  return { host: url.hostname, port, ssl };
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

export class ChromaStore implements VectorStore {
  private client = new ChromaClient(getChromaClientArgs());
  private col: any = null;

  private async getCollection() {
    if (this.col) return this.col;
    const embeddingFunction = getChromaEmbeddingFunction();
    try {
      this.col = await this.client.getCollection({
        name: env.CHROMA_COLLECTION,
        ...(embeddingFunction ? { embeddingFunction } : {})
      });
    } catch {
      this.col = await this.client.createCollection({
        name: env.CHROMA_COLLECTION,
        // We always send embeddings explicitly, so avoid the default embedding function unless enabled.
        embeddingFunction: embeddingFunction ?? null
      });
    }
    return this.col;
  }

  async upsert(docs: { id: string; text: string; meta?: Record<string, any> }[]) {
    const col = await this.getCollection();

    const ids: string[] = [];
    const texts: string[] = [];
    const metas: Record<string, any>[] = [];

    for (const d of docs) {
      for (const c of chunkText(d.text)) {
        ids.push(randomUUID());
        texts.push(c);
        metas.push({ ...(d.meta ?? {}), sourceId: d.id });
      }
    }

    const vectors = await embed(texts);

    await col.add({
      ids,
      documents: texts,
      metadatas: metas,
      embeddings: vectors
    });

    return { chunks: ids.length };
  }

  async query(queryText: string, k: number, options?: { filter?: Record<string, string | number | boolean> }): Promise<RetrievedChunk[]> {
    const col = await this.getCollection();
    const [qVec] = await embed([queryText]);

    const res = await col.query({
      queryEmbeddings: [qVec],
      nResults: k,
      include: ["documents", "metadatas", "distances"],
      ...(options?.filter ? { where: options.filter } : {})
    });

    const docs = (res.documents?.[0] ?? []).map((text: string | null, i: number) => {
      const distance = res.distances?.[0]?.[i] ?? 999;
      // convert distance -> score (rough)
      const score = 1 / (1 + distance);
      return {
        text: text ?? "",
        meta: (res.metadatas?.[0]?.[i] ?? {}) as Record<string, unknown>,
        score
      };
    });

    return docs;
  }
}
