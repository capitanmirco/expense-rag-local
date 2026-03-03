import OpenAI from "openai";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import { env } from "./config.js";

const openai = new OpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL
});

let defaultEmbedder: DefaultEmbeddingFunction | null = null;

function getDefaultEmbedder() {
  if (!defaultEmbedder) {
    const modelName = env.EMBEDDINGS_MODEL?.trim();
    defaultEmbedder = modelName ? new DefaultEmbeddingFunction({ modelName }) : new DefaultEmbeddingFunction();
  }
  return defaultEmbedder;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (env.EMBEDDINGS_PROVIDER === "default-embed") {
    const embedder = getDefaultEmbedder();
    return await embedder.generate(texts);
  }

  if (env.EMBEDDINGS_PROVIDER === "openai-compat") {
    if (!env.LLM_API_KEY || !env.EMBEDDINGS_MODEL) {
      throw new Error("openai-compat: LLM_API_KEY e EMBEDDINGS_MODEL sono obbligatori");
    }

    const res = await openai.embeddings.create({
      model: env.EMBEDDINGS_MODEL,
      input: texts
    });
    return res.data.map(d => d.embedding as unknown as number[]);
  }

  // Ollama nativo (POST /api/embeddings) — richieste in parallelo
  return Promise.all(
    texts.map(async (t) => {
      const r = await fetch(`${env.OLLAMA_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.EMBEDDINGS_MODEL, prompt: t })
      });
      if (!r.ok) throw new Error(`Ollama embeddings error: ${r.status}`);
      const j = await r.json() as { embedding: number[] };
      return j.embedding;
    })
  );
}
