import { IsNumber, IsArray, IsString, IsObject, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFormDto {
  @IsNumber()
  schemeId: number;

  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsObject()
  formData: {
    customerName: string;
    contact: string;
    phone: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    totalAmount: number;
    totalQuantity: number;
  };
}

export class UpdateFormStatusDto {
  @IsEnum(['draft', 'submitted', 'approved'])
  status: string;
}
