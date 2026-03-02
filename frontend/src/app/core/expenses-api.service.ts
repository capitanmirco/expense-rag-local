import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { API_BASE_URL } from "./api.config";

export type Expense = {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: string;
};

@Injectable({ providedIn: "root" })
export class ExpensesApiService {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Expense[]>(`${API_BASE_URL}/expenses`);
  }

  create(dto: Omit<Expense, "id">) {
    return this.http.post<Expense>(`${API_BASE_URL}/expenses`, dto);
  }

  update(id: string, dto: Partial<Omit<Expense, "id">>) {
    return this.http.patch<Expense>(`${API_BASE_URL}/expenses/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<{ ok: boolean }>(`${API_BASE_URL}/expenses/${id}`);
  }
}
