import { Controller, Get, Post, Patch, Delete, Param, Body } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";

@Controller("expenses")
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.svc.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
