import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { CHAT_BASE_URL } from "./api.config";

export type ChatMsg = { role: "user" | "assistant"; content: string };

@Injectable({ providedIn: "root" })
export class ChatApiService {
  constructor(private http: HttpClient) {}

  send(messages: ChatMsg[]) {
    return this.http.post<{ reply: string; sources?: any[] }>(`${CHAT_BASE_URL}/chat`, { messages });
  }

  uploadPdf(file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return this.http.post<{ ok: boolean; chunks: number; mdFile: string; docId: string }>(
      `${CHAT_BASE_URL}/rag/upload`,
      form
    );
  }
}
