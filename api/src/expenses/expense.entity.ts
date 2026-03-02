import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Expense {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("real")
  amount!: number;

  @Column({ default: "EUR" })
  currency!: string;

  @Column({ default: "general" })
  category!: string;

  @Column({ default: "" })
  description!: string;

  // ISO date (YYYY-MM-DD)
  @Column({ type: "text" })
  date!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
