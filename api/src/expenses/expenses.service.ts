import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Expense } from "./expense.entity";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly repo: Repository<Expense>,
  ) {}

  findAll() {
    return this.repo.find({ order: { date: "DESC", createdAt: "DESC" } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Expense not found");
    return item;
  }

  create(dto: CreateExpenseDto) {
    const e = this.repo.create({
      amount: dto.amount,
      currency: dto.currency ?? "EUR",
      category: dto.category ?? "general",
      description: dto.description ?? "",
      date: dto.date
    });
    return this.repo.save(e);
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    return { ok: true };
  }
}
