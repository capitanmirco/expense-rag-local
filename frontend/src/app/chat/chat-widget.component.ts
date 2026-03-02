import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { ChatApiService, ChatMsg } from "../core/chat-api.service";

@Component({
  standalone: true,
  selector: "app-chat-widget",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./chat-widget.component.html",
  styleUrls: ["./chat-widget.component.css"]
})
export class ChatWidgetComponent {
  messages = signal<ChatMsg[]>([]);
  sending = signal(false);
  session = signal(0);
  uploading = signal(false);
  uploadMessage = signal<string | null>(null);

  form = this.fb.group({
    text: this.fb.control("", { validators: [Validators.required], nonNullable: true })
  });

  constructor(private fb: FormBuilder, private chat: ChatApiService) {}

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
    this.chat.send(next).subscribe({
      next: (r) => {
        if (sessionId !== this.session()) return;
        this.messages.set([...this.messages(), { role: "assistant", content: r.reply }]);
        this.sending.set(false);
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

    this.chat.uploadPdf(file).subscribe({
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
