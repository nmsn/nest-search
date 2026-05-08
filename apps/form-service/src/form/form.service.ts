import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { getBusinessLineTables } from '../database/schema/schema-factory';
import { eq } from 'drizzle-orm';
import { CreateFormDto, UpdateFormStatusDto } from './dto/create-form.dto';

@Injectable()
export class FormService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(businessLine: string, dto: CreateFormDto) {
    const tables = getBusinessLineTables(businessLine);

    const totalAmount = dto.formData.items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );
    const totalQuantity = dto.formData.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const insertResult = await this.drizzle.db
      .insert(tables.forms)
      .values({
        schemeId: dto.schemeId,
        productIds: dto.productIds,
        totalAmount: totalAmount.toString(),
        totalQuantity,
        formData: dto.formData,
      });
    const insertedId = insertResult[0].insertId;
    return this.findOne(businessLine, Number(insertedId));
  }

  async findAll(businessLine: string) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.select().from(tables.forms);
  }

  async findOne(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    const [result] = await this.drizzle.db
      .select()
      .from(tables.forms)
      .where(eq(tables.forms.id, id))
      .limit(1);

    if (!result) throw new NotFoundException(`Form #${id} not found`);
    return result;
  }

  async updateStatus(businessLine: string, id: number, dto: UpdateFormStatusDto) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);

    await this.drizzle.db
      .update(tables.forms)
      .set({ status: dto.status as any })
      .where(eq(tables.forms.id, id));

    return this.findOne(businessLine, id);
  }
}
