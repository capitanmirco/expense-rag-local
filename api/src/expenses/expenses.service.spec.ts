import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { Expense } from "./expense.entity";

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

const mockExpense: Expense = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  amount: 25.5,
  currency: "EUR",
  category: "food",
  description: "Pizza",
  date: "2026-01-15",
  createdAt: new Date("2026-01-15T10:00:00Z"),
  updatedAt: new Date("2026-01-15T10:00:00Z"),
};

describe("ExpensesService", () => {
  let service: ExpensesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    jest.clearAllMocks();
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe("findAll", () => {
    it("returns all expenses sorted by date DESC", async () => {
      mockRepo.find.mockResolvedValue([mockExpense]);

      const result = await service.findAll();

      expect(mockRepo.find).toHaveBeenCalledWith({
        order: { date: "DESC", createdAt: "DESC" },
      });
      expect(result).toEqual([mockExpense]);
    });

    it("returns empty array when no expenses exist", async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe("findOne", () => {
    it("returns the expense when found", async () => {
      mockRepo.findOne.mockResolvedValue(mockExpense);

      const result = await service.findOne(mockExpense.id);

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: mockExpense.id } });
      expect(result).toEqual(mockExpense);
    });

    it("throws NotFoundException when expense does not exist", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("non-existent-id")).rejects.toThrow(NotFoundException);
    });

    it("NotFoundException message includes 'Expense not found'", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("x")).rejects.toThrow("Expense not found");
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates and saves an expense with all fields", async () => {
      const dto = { amount: 10, date: "2026-02-01", currency: "USD", category: "transport", description: "Bus" };
      const entity = { ...mockExpense, ...dto };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith({
        amount: dto.amount,
        currency: dto.currency,
        category: dto.category,
        description: dto.description,
        date: dto.date,
      });
      expect(mockRepo.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(entity);
    });

    it("uses default currency EUR when not provided", async () => {
      const dto = { amount: 5, date: "2026-03-01" };
      mockRepo.create.mockReturnValue({ ...mockExpense, currency: "EUR" });
      mockRepo.save.mockResolvedValue({ ...mockExpense, currency: "EUR" });

      await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "EUR" })
      );
    });

    it("uses default category 'general' when not provided", async () => {
      const dto = { amount: 5, date: "2026-03-01" };
      mockRepo.create.mockReturnValue({ ...mockExpense, category: "general" });
      mockRepo.save.mockResolvedValue({ ...mockExpense, category: "general" });

      await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: "general" })
      );
    });

    it("uses empty description when not provided", async () => {
      const dto = { amount: 5, date: "2026-03-01" };
      mockRepo.create.mockReturnValue({ ...mockExpense, description: "" });
      mockRepo.save.mockResolvedValue({ ...mockExpense, description: "" });

      await service.create(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: "" })
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates an existing expense and returns the saved entity", async () => {
      const updated = { ...mockExpense, amount: 99, description: "Updated" };
      mockRepo.findOne.mockResolvedValue({ ...mockExpense });
      mockRepo.save.mockResolvedValue(updated);

      const result = await service.update(mockExpense.id, { amount: 99, description: "Updated" });

      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.amount).toBe(99);
    });

    it("throws NotFoundException when expense to update does not exist", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.update("bad-id", { amount: 50 })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("removes an expense and returns { ok: true }", async () => {
      mockRepo.findOne.mockResolvedValue(mockExpense);
      mockRepo.remove.mockResolvedValue(undefined);

      const result = await service.remove(mockExpense.id);

      expect(mockRepo.remove).toHaveBeenCalledWith(mockExpense);
      expect(result).toEqual({ ok: true });
    });

    it("throws NotFoundException when expense to remove does not exist", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("bad-id")).rejects.toThrow(NotFoundException);
    });
  });
});
