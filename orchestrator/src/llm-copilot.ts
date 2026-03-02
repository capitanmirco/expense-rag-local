/**
 * LLM provider basato su @github/copilot-sdk.
 *
 * Richiede:
 *  - GitHub Copilot CLI installata e nel PATH (comando `copilot`)
 *    oppure definita via COPILOT_CLI_PATH
 *  - Autenticazione tramite COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN
 *    oppure login interattivo già effettuato con la CLI
 *
 * Il client viene creato una sola volta (singleton) al primo utilizzo.
 * Ogni chiamata a chat() crea una sessione dedicata, la utilizza e poi la distrugge.
 */
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { env } from "./config.js";

type Message = { role: "system" | "user" | "assistant"; content: string };

let _client: CopilotClient | null = null;
let _startPromise: Promise<void> | null = null;

/**
 * Restituisce il client già avviato e connesso.
 * La connessione avviene una sola volta; le chiamate successive aspettano
 * la stessa promise senza riavviare il processo.
 */
async function getStartedClient(): Promise<CopilotClient> {
  if (!_client) {
    const opts: ConstructorParameters<typeof CopilotClient>[0] = {
      autoStart: false, // gestito manualmente per tracciare la promise di avvio
      autoRestart: true,
    };

    if (env.COPILOT_CLI_PATH) opts.cliPath = env.COPILOT_CLI_PATH;
    if (env.COPILOT_GITHUB_TOKEN) opts.githubToken = env.COPILOT_GITHUB_TOKEN;

    _client = new CopilotClient(opts);
    console.log("[copilot-sdk] CopilotClient creato, avvio in corso...");
    _startPromise = _client.start().then(() => console.log("[copilot-sdk] CopilotClient connesso"));
  }
  await _startPromise;
  return _client;
}

export async function listCopilotModels() {
  const client = await getStartedClient();
  // Bypass the SDK's permanent in-memory cache (client.listModels() caches once
  // and never refreshes within the process lifetime). Calling the underlying RPC
  // directly ensures we always get the up-to-date list from the CLI daemon.
  const result = await client.rpc.models.list();
  console.log(`[copilot-sdk] listModels raw (${result.models.length} models):`,
    result.models.map(m => `${m.id} policy=${m.policy?.state ?? "n/a"} billing=${m.billing?.multiplier ?? "n/a"}`).join(", ")
  );
  return result.models;
}

export async function getCopilotQuota() {
  const client = await getStartedClient();
  return client.rpc.account.getQuota();
}

/**
 * Interfaccia identica a chat() di llm.ts — drop-in replacement.
 *
 * Strategia per la cronologia:
 *  - messages[0] (system): iniettato tramite systemMessage.mode="replace"
 *  - messages[1..n-2]: storia precedente, aggiunta al system message
 *  - messages[n-1]: ultimo messaggio (utente o assistant/tool-result), inviato come prompt
 */
export async function chatViaCopilotSdk(messages: Message[], model?: string): Promise<string> {
  if (messages.length === 0) return "";

  const client = await getStartedClient();

  const systemMsg = messages[0].role === "system" ? messages[0].content : "";
  const rest = messages[0].role === "system" ? messages.slice(1) : messages;

  // Storia precedente (tutti tranne l'ultimo messaggio)
  const history = rest.slice(0, -1);
  const lastMsg = rest[rest.length - 1];

  if (!lastMsg) return "";

  // Costruisce il blocco di storia da iniettare nel system message
  const historyBlock =
    history.length > 0
      ? "\n\nSTORIA DELLA CONVERSAZIONE (solo per contesto — NON rispondere ad essa):\n" +
        history
          .map((m) => `${m.role === "user" ? "Utente" : "Assistente"}: ${m.content}`)
          .join("\n\n")
      : "";

  const fullSystem = systemMsg + historyBlock;

  // Prompt finale da inviare alla sessione
  let prompt: string;
  if (lastMsg.role === "user") {
    prompt = lastMsg.content;
  } else {
    // Caso tool-result: ultimo messaggio è role "assistant" con "Tool result (...): {...}"
    prompt =
      lastMsg.content +
      "\n\nGenera ora la risposta finale per l'utente in italiano, basandoti sul risultato del tool sopra. Linguaggio naturale, nessun JSON.";
  }

  const session = await client.createSession({
    model: model || env.COPILOT_MODEL || "gpt-4.1",
    onPermissionRequest: approveAll,
    systemMessage: {
      mode: "replace",
      content: fullSystem,
    },
    // Disabilita tutti i tool nativi della CLI (shell, file, web): forza la modalità chat pura.
    // Senza questo il modello entra in modalità agente e sendAndWait non riceve mai un assistant.message.
    availableTools: [],
    infiniteSessions: { enabled: false },
  });

  try {
    const t0 = Date.now();
    // Passa il timeout direttamente a sendAndWait invece di usare Promise.race:
    // evita di chiamare session.destroy() mentre l'SDK è ancora in elaborazione.
    const response = await session.sendAndWait({ prompt }, env.LLM_TIMEOUT_MS);
    console.log(`[copilot-sdk] risposta in ${Date.now() - t0}ms`);
    if (!response) {
      console.warn("[copilot-sdk] sendAndWait ha restituito undefined (nessun assistant.message ricevuto)");
      return "";
    }
    return response.data.content;
  } finally {
    await session.destroy();
  }
}
