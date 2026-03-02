import OpenAI from "openai";
import { env } from "./config.js";

export const llm = new OpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL
});

export async function chat(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    // modalità "dry": utile per avviare il progetto senza chiavi
    return "LLM non configurato. Imposta GROQ_API_KEY e GROQ_MODEL (o LLM_API_KEY e LLM_MODEL) in orchestrator/.env";
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`LLM timeout after ${env.LLM_TIMEOUT_MS}ms`)), env.LLM_TIMEOUT_MS)
  );

  const completion = llm.chat.completions.create({
    model: env.LLM_MODEL,
    messages,
    temperature: 0.2
  });

  const res = await Promise.race([completion, timeout]);
  return res.choices[0]?.message?.content ?? "";
}
