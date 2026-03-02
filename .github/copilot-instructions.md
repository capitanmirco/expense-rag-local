# Expense RAG Project - AI Agent Instructions

## Architecture Overview

This is a **3-service RAG (Retrieval Augmented Generation) application** for managing personal expenses with AI chat capabilities:

- **Frontend** (Angular 19, port 4200): UI for CRUD operations + chat widget
- **API** (NestJS, port 3000): REST API for expenses, backed by SQLite (`api/data/expenses.sqlite`)
- **Orchestrator** (Express, port 3001): RAG pipeline + LLM chat + tool execution

### Data Flow
```
User Chat → Frontend → Orchestrator → RAG (Chroma/Local) + LLM (Groq) + Tools → API → Response
User CRUD → Frontend → API (direct) → SQLite
```

## Critical Development Workflows

### Starting the Application (4 terminals required)
```bash
# Terminal 1: Start Chroma vector DB (optional, can use local fallback)
chroma run --host localhost --port 8000 --path ./data/chroma

# Terminal 2: API
cd api
npm run start:dev

# Terminal 3: Orchestrator
cd orchestrator
npm run dev

# Terminal 4: Frontend
cd frontend
npm start
```

### Environment Configuration
**Orchestrator requires `.env` file** (copy from `.env.example`):
- `LLM_PROVIDER=groq` (or other OpenAI-compatible provider)
- `GROQ_API_KEY` and `GROQ_MODEL` must be set for chat to work
- `VECTOR_STORE=chroma` (default) or `local` (fallback without ChromaDB)
- `EMBEDDINGS_PROVIDER=default-embed` (local, recommended) or `openai-compat`/`ollama-native`

## Project-Specific Patterns

### Tool Calling Pattern (Orchestrator)
The orchestrator implements a **structured JSON tool protocol**:
1. LLM responds with JSON like `{"tool":"expenses.list","args":{}}` for tool calls
2. Orchestrator executes tool in [orchestrator/src/tools/expenses.ts](orchestrator/src/tools/expenses.ts)
3. Result sent back to LLM with prefix `"Tool result (expenses.list): {data}"`
4. LLM generates natural language response (no JSON, no technical details)

**Critical**: When LLM sees "Tool result", it MUST NOT call another tool—only generate user-facing response.

### RAG Context Injection
Every `/chat` request:
1. Queries vector store with user's last message
2. Retrieves top 4 chunks with similarity scores
3. Injects as `CONTENUTO RAG` block in system prompt
4. Format: `[#1 score=0.856] {chunk text}\n\n[#2 score=0.742] ...`

See [orchestrator/src/server.ts](orchestrator/src/server.ts) lines 30-75 for full RAG + tool flow.

### Vector Store Abstraction
Two implementations in [orchestrator/src/vectorstore/](orchestrator/src/vectorstore/):
- **ChromaStore**: Production, requires ChromaDB server running on port 8000
- **LocalStore**: Fallback, stores embeddings in `data/fallback-store.json` (no external deps)

Both implement `VectorStore` interface ([types.ts](orchestrator/src/vectorstore/types.ts)). Switch via `VECTOR_STORE` env var.

### Embeddings Strategy
Three providers supported ([orchestrator/src/embeddings.ts](orchestrator/src/embeddings.ts)):
- `default-embed`: **Recommended**, uses `@chroma-core/default-embed` (local, no API calls)
- `openai-compat`: Any OpenAI-compatible embedding endpoint
- `ollama-native`: Local Ollama server

Default: `Xenova/all-MiniLM-L6-v2` model (384-dim vectors).

### Text Chunking
[chroma-store.ts](orchestrator/src/vectorstore/chroma-store.ts) splits documents by paragraphs (`\n\n`), max 900 chars per chunk. Each chunk gets unique UUID, preserving original doc metadata.

## NestJS API Conventions

- **DTOs**: Located in `dto/` subfolders (e.g., [expenses/dto/create-expense.dto.ts](api/src/expenses/dto/create-expense.dto.ts))
- **Validation**: Uses `class-validator` decorators on DTOs
- **Database**: TypeORM with SQLite, entities in `*.entity.ts` files
- **Service pattern**: Business logic in `*.service.ts`, controllers delegate to services
- Default sort: Expenses ordered by `date DESC, createdAt DESC`

## Angular Frontend Conventions

- **Standalone components**: No NgModules (Angular 19)
- **API services**: Injected via `providedIn: 'root'` (see [core/](frontend/src/app/core/))
- **Base URLs**: Centralized in [api.config.ts](frontend/src/app/core/api.config.ts)
  - `API_BASE_URL = "http://localhost:3000"`
  - `CHAT_BASE_URL = "http://localhost:3001"`
- **Chat widget**: Maintains local message array, sends full history to orchestrator on each message

## Key Integration Points

### Orchestrator → API Communication
Orchestrator calls Nest API via plain `fetch()` in [tools/expenses.ts](orchestrator/src/tools/expenses.ts):
- Base URL from `env.API_BASE_URL` (defaults to `http://localhost:3000`)
- No auth layer (local development)
- Tools match NestJS controller endpoints 1:1

### Frontend → Orchestrator Chat
[chat-api.service.ts](frontend/src/app/core/chat-api.service.ts) sends entire message history:
```typescript
POST /chat { messages: [{ role: "user", content: "..." }, ...] }
Response: { reply: string, sources?: any[] }
```

### Orchestrator LLM Config Resolution
[config.ts](orchestrator/src/config.ts) auto-resolves Groq provider:
```typescript
if (LLM_PROVIDER === "groq") {
  LLM_BASE_URL = "https://api.groq.com/openai/v1"
  LLM_API_KEY = GROQ_API_KEY
  LLM_MODEL = GROQ_MODEL
}
```
Other providers (OpenAI-compatible) use `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` directly.

## Common Pitfalls

1. **Chroma not running**: If orchestrator fails with connection error, either start Chroma or set `VECTOR_STORE=local`
2. **Missing API key**: Chat will fail silently if `GROQ_API_KEY` is empty—check orchestrator logs
3. **Port conflicts**: Verify 3000 (API), 3001 (Orchestrator), 4200 (Frontend), 8000 (Chroma) are available
4. **Embeddings mismatch**: If switching embedding providers, clear Chroma collection or delete `data/fallback-store.json`

## File System Conventions

- **No Docker**: All services run directly via npm scripts
- **Data persistence**: SQLite in `api/data/`, Chroma in `orchestrator/data/chroma/`
- **TypeScript**: All services use ES modules (`"type": "module"`)
- **Dev mode**: Use `npm run start:dev` (API), `npm run dev` (orchestrator), `npm start` (frontend)

## Testing Notes

No test suites currently implemented. To verify setup:
1. Add expense via UI
2. Chat: "Elenca le mie spese" → should trigger `expenses.list` tool
3. RAG: Ingest via `POST /rag/ingest` → query should retrieve chunks

---
**Last updated**: Jan 2026 | **Docs**: [README.md](README.md), [ARCHITETTURA.md](ARCHITETTURA.md)
