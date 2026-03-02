import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3001),

  VECTOR_STORE: z.enum(["chroma", "local"]).default("chroma"),

  CHROMA_URL: z.string().default("http://localhost:8000"),
  CHROMA_COLLECTION: z.string().default("kb_store"),

  API_BASE_URL: z.string().default("http://localhost:3000"),

  TOOLS_BACKEND: z.enum(["api", "mcp"]).default("api"),
  MCP_URL: z.string().default("http://localhost:3400/rpc"),
  MCP_PORT: z.coerce.number().default(3400),

  LLM_PROVIDER: z.string().default("groq"),

  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().default(""),

  LLM_BASE_URL: z.string().default(""),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),

  EMBEDDINGS_PROVIDER: z.enum(["openai-compat", "ollama-native", "default-embed"]).default("default-embed"),
  EMBEDDINGS_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),
  OLLAMA_URL: z.string().default("http://localhost:11434"),

  SCOPE_DOMAIN: z.string().default("app demo"),
  SCOPE_MIN_SCORE: z.coerce.number().default(0.2),

  DOC_MIN_SCORE: z.coerce.number().default(0.2),
  EXPENSES_MIN_SCORE: z.coerce.number().default(0.2),
  DOC_K: z.coerce.number().min(1).default(4),
  EXPENSES_K: z.coerce.number().min(1).default(4),
  INTENT_DELTA: z.coerce.number().default(0.05),
  EXPENSES_CACHE_TTL_MS: z.coerce.number().default(30000),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),

  // Copilot SDK
  COPILOT_MODEL: z.string().default("gpt-4.1"),
  COPILOT_CLI_PATH: z.string().default(""),
  COPILOT_GITHUB_TOKEN: z.string().default(""),

  // Web search (Brave Search API se la chiave è presente, DuckDuckGo instant altrimenti)
  WEBSEARCH_API_KEY: z.string().default("")
});

const raw = schema.parse(process.env);
const resolved = { ...raw };
const provider = raw.LLM_PROVIDER?.toLowerCase();

if (provider === "groq") {
  if (!resolved.LLM_BASE_URL) resolved.LLM_BASE_URL = "https://api.groq.com/openai/v1";
  if (!resolved.LLM_API_KEY) resolved.LLM_API_KEY = raw.GROQ_API_KEY;
  if (!resolved.LLM_MODEL) resolved.LLM_MODEL = raw.GROQ_MODEL;
}

export const env = resolved;
