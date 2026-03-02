import { IsNumber, IsOptional, IsString, Matches, Min } from "class-validator";

export class CreateExpenseDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
