import { Component, OnInit, Output, EventEmitter, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { ChatApiService, ChatMsg, ModelOption, QuotaSnapshot } from "../core/chat-api.service";

/** Ordine: gratuiti prima (alfabetico), poi a pagamento (alfabetico), poi non-enabled in coda. */
function sortModels(list: ModelOption[]): ModelOption[] {
  return [...list].sort((a, b) => {
    // Modelli non abilitati vanno in fondo
    const aEnabled = !a.policy || a.policy === "enabled";
    const bEnabled = !b.policy || b.policy === "enabled";
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
    // Gratuiti prima
    const aFree = a.multiplier === 0;
    const bFree = b.multiplier === 0;
    if (aFree !== bFree) return aFree ? -1 : 1;
    return a.name.localeCompare(b.name, "it");
  });
}

@Component({
  standalone: true,
  selector: "app-chat-widget",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./chat-widget.component.html",
  styleUrls: ["./chat-widget.component.css"]
})
export class ChatWidgetComponent implements OnInit {
  @Output() expensesChanged = new EventEmitter<void>();

  models = signal<ModelOption[]>([]);
  modelsLoading = signal(true);

  messages = signal<ChatMsg[]>([]);
  sending = signal(false);
  session = signal(0);
  uploading = signal(false);
  uploadMessage = signal<string | null>(null);
  selectedModel = signal<string>("");
  sessionPremiumRequests = signal<number>(0);
  premiumQuota = signal<QuotaSnapshot | null>(null);

  premiumRequestsFormatted = computed(() => {
    const n = Math.round(this.sessionPremiumRequests() * 100) / 100;
    return n % 1 === 0 ? n.toString() : n.toFixed(2);
  });

  premiumQuotaDisplay = computed(() => {
    const q = this.premiumQuota();
    if (!q) return null;
    const remaining = Math.max(0, q.entitlementRequests - q.usedRequests);
    const pct = Math.round(q.remainingPercentage);
    const resetDate = q.resetDate
      ? new Date(q.resetDate).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
      : null;
    return { remaining, total: q.entitlementRequests, pct, resetDate };
  });

  form = this.fb.group({
    text: this.fb.control("", { validators: [Validators.required], nonNullable: true })
  });

  constructor(private fb: FormBuilder, private chatApi: ChatApiService) {}

  ngOnInit() {
    this.chatApi.getModels().subscribe({
      next: ({ models }) => {
        const sorted = sortModels(models);
        this.models.set(sorted);
        if (sorted.length > 0) {
          const stillExists = sorted.find(m => m.id === this.selectedModel());
          if (!stillExists) this.selectedModel.set(sorted[0].id);
        }
        this.modelsLoading.set(false);
        // Chiama getQuota dopo che il client è connesso (listModels lo garantisce)
        this.refreshQuota();
      },
      error: () => this.modelsLoading.set(false)
    });
  }

  private refreshQuota() {
    this.chatApi.getQuota().subscribe({
      next: ({ quotaSnapshots }) => {
        const key = Object.keys(quotaSnapshots).find(k => k.toLowerCase().includes("premium"))
          ?? Object.keys(quotaSnapshots)[0];
        this.premiumQuota.set(key ? quotaSnapshots[key] : null);
      },
      error: () => {}
    });
  }

  onModelChange(event: Event) {
    this.selectedModel.set((event.target as HTMLSelectElement).value);
  }

  newChat() {
    this.session.set(this.session() + 1);
    this.messages.set([]);
    this.sending.set(false);
    this.uploading.set(false);
    this.uploadMessage.set(null);
    this.form.reset();
  }

  send() {
    const text = this.form.getRawValue().text.trim();
    if (!text) return;

    const MAX_HISTORY = 50;
    const all = [...this.messages(), { role: "user", content: text } as ChatMsg];
    const next = all.length > MAX_HISTORY ? all.slice(all.length - MAX_HISTORY) : all;
    this.messages.set(next);
    this.form.reset();

    this.sending.set(true);
    const sessionId = this.session();
    const model = this.selectedModel();
    const cost = this.models().find(m => m.id === model)?.multiplier ?? 0;

    this.chatApi.send(next, model).subscribe({
      next: (r) => {
        if (sessionId !== this.session()) return;
        this.messages.set([...this.messages(), { role: "assistant", content: r.reply }]);
        this.sessionPremiumRequests.update(n => Math.round((n + cost) * 100) / 100);
        this.sending.set(false);
        this.refreshQuota();
        if (r.expensesChanged) this.expensesChanged.emit();
      },
      error: () => {
        if (sessionId !== this.session()) return;
        this.messages.set([...this.messages(), { role: "assistant", content: "Errore chiamando /chat (orchestrator non avviato?)" }]);
        this.sending.set(false);
      }
    });
  }

  uploadFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading.set(true);
    this.uploadMessage.set("Caricamento PDF in corso...");

    this.chatApi.uploadPdf(file).subscribe({
      next: (r) => {
        const name = r.mdFile || file.name;
        this.uploadMessage.set(`PDF caricato: ${name}`);
        this.uploading.set(false);
        input.value = "";
      },
      error: () => {
        this.uploadMessage.set("Errore durante il caricamento del PDF.");
        this.uploading.set(false);
        input.value = "";
      }
    });
  }
}
