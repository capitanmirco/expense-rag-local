import { Test, TestingModule } from "@nestjs/testing";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { Expense } from "./expense.entity";

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

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe("ExpensesController", () => {
  let controller: ExpensesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: mockService }],
    }).compile();

    controller = module.get<ExpensesController>(ExpensesController);
    jest.clearAllMocks();
  });

  describe("findAll", () => {
    it("delegates to service.findAll()", async () => {
      mockService.findAll.mockResolvedValue([mockExpense]);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockExpense]);
    });
  });

  describe("findOne", () => {
    it("delegates to service.findOne() with correct id", async () => {
      mockService.findOne.mockResolvedValue(mockExpense);

      const result = await controller.findOne(mockExpense.id);

      expect(mockService.findOne).toHaveBeenCalledWith(mockExpense.id);
      expect(result).toEqual(mockExpense);
    });
  });

  describe("create", () => {
    it("delegates to service.create() with dto", async () => {
      const dto = { amount: 10, date: "2026-02-01", currency: "USD", category: "transport", description: "Bus" };
      mockService.create.mockResolvedValue({ ...mockExpense, ...dto });

      const result = await controller.create(dto as any);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result.amount).toBe(10);
    });
  });

  describe("update", () => {
    it("delegates to service.update() with id and dto", async () => {
      const dto = { amount: 99 };
      mockService.update.mockResolvedValue({ ...mockExpense, amount: 99 });

      const result = await controller.update(mockExpense.id, dto as any);

      expect(mockService.update).toHaveBeenCalledWith(mockExpense.id, dto);
      expect(result.amount).toBe(99);
    });
  });

  describe("remove", () => {
    it("delegates to service.remove() with id", async () => {
      mockService.remove.mockResolvedValue({ ok: true });

      const result = await controller.remove(mockExpense.id);

      expect(mockService.remove).toHaveBeenCalledWith(mockExpense.id);
      expect(result).toEqual({ ok: true });
    });
  });
});
