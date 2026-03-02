import { env } from "../config.js";
import type { VectorStore } from "./types.js";
import { ChromaStore } from "./chroma-store.js";
import { LocalStore } from "./local-store.js";

async function chromaReachable(url: string) {
  try {
    const r = await fetch(url, { method: "GET" });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

export async function createVectorStore(): Promise<VectorStore> {
  if (env.VECTOR_STORE === "local") return new LocalStore();

  const ok = await chromaReachable(env.CHROMA_URL);
  if (!ok) {
    console.warn(`[vectorstore] Chroma non raggiungibile su ${env.CHROMA_URL}. Uso fallback local.`);
    return new LocalStore();
  }

  return new ChromaStore();
}
