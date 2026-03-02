import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { CHAT_BASE_URL } from "./api.config";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface ModelOption {
  id: string;
  name: string;
  multiplier: number;
  /** Policy state from GitHub Copilot: "enabled" | "disabled" | "unconfigured" */
  policy?: string;
}

export interface QuotaSnapshot {
  isUnlimitedEntitlement?: boolean;
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: number;
  resetDate?: string;
}

@Injectable({ providedIn: "root" })
export class ChatApiService {
  constructor(private http: HttpClient) {}

  getModels() {
    return this.http.get<{ models: ModelOption[] }>(`${CHAT_BASE_URL}/models`);
  }

  getQuota() {
    return this.http.get<{ quotaSnapshots: Record<string, QuotaSnapshot> }>(`${CHAT_BASE_URL}/quota`);
  }

  send(messages: ChatMsg[], model?: string) {
    return this.http.post<{ reply: string; sources?: any[]; expensesChanged?: boolean }>(`${CHAT_BASE_URL}/chat`, { messages, model });
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
