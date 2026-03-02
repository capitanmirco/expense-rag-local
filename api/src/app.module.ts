import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ExpensesModule } from "./expenses/expenses.module";
import { Expense } from "./expenses/expense.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: "sqlite",
      database: "data/expenses.sqlite",
      entities: [Expense],
      synchronize: true
    }),
    ExpensesModule
  ]
})
export class AppModule {}
