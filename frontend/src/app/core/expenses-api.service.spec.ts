import { TestBed } from "@angular/core/testing";
import { provideHttpClientTesting, HttpTestingController } from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { ExpensesApiService, Expense } from "./expenses-api.service";
import { API_BASE_URL } from "./api.config";

describe("ExpensesApiService", () => {
  let service: ExpensesApiService;
  let httpMock: HttpTestingController;

  const mockExpense: Expense = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    amount: 25.5,
    currency: "EUR",
    category: "food",
    description: "Pizza",
    date: "2026-01-15",
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExpensesApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExpensesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe("list()", () => {
    it("sends GET to /expenses and returns array", () => {
      service.list().subscribe((result) => {
        expect(result).toEqual([mockExpense]);
      });

      const req = httpMock.expectOne(`${API_BASE_URL}/expenses`);
      expect(req.request.method).toBe("GET");
      req.flush([mockExpense]);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe("create()", () => {
    it("sends POST to /expenses with dto body and returns created expense", () => {
      const dto: Omit<Expense, "id"> = {
        amount: 10,
        currency: "EUR",
        category: "transport",
        description: "Bus",
        date: "2026-02-01",
      };

      service.create(dto).subscribe((result) => {
        expect(result).toEqual(mockExpense);
      });

      const req = httpMock.expectOne(`${API_BASE_URL}/expenses`);
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual(dto);
      req.flush(mockExpense);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe("update()", () => {
    it("sends PATCH to /expenses/:id with patch body", () => {
      const patch: Partial<Omit<Expense, "id">> = { amount: 99 };

      service.update(mockExpense.id, patch).subscribe((result) => {
        expect(result.amount).toBe(99);
      });

      const req = httpMock.expectOne(`${API_BASE_URL}/expenses/${mockExpense.id}`);
      expect(req.request.method).toBe("PATCH");
      expect(req.request.body).toEqual(patch);
      req.flush({ ...mockExpense, amount: 99 });
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe("remove()", () => {
    it("sends DELETE to /expenses/:id and returns { ok: true }", () => {
      service.remove(mockExpense.id).subscribe((result) => {
        expect(result).toEqual({ ok: true });
      });

      const req = httpMock.expectOne(`${API_BASE_URL}/expenses/${mockExpense.id}`);
      expect(req.request.method).toBe("DELETE");
      req.flush({ ok: true });
    });
  });
});
