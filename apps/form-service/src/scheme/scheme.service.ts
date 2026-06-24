import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { getBusinessLineTables } from '../database/schema/schema-factory';
import { eq } from 'drizzle-orm';
import { CreateSchemeDto, UpdateSchemeDto } from './dto/create-scheme.dto';

@Injectable()
export class SchemeService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(businessLine: string, dto: CreateSchemeDto) {
    const tables = getBusinessLineTables(businessLine);
    const [inserted] = await this.drizzle.db
      .insert(tables.schemes)
      .values({
        name: dto.name,
        description: dto.description,
        status: dto.status as any,
        config: dto.config,
      })
      .returning({ id: tables.schemes.id });
    return this.findOne(businessLine, inserted.id);
  }

  async findAll(businessLine: string) {
    const tables = getBusinessLineTables(businessLine);
    return this.drizzle.db.select().from(tables.schemes);
  }

  async findOne(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    const [result] = await this.drizzle.db
      .select()
      .from(tables.schemes)
      .where(eq(tables.schemes.id, id))
      .limit(1);

    if (!result) throw new NotFoundException(`Scheme #${id} not found`);
    return result;
  }

  async update(businessLine: string, id: number, dto: UpdateSchemeDto) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);

    await this.drizzle.db
      .update(tables.schemes)
      .set({
        ...dto,
        status: dto.status as any,
      })
      .where(eq(tables.schemes.id, id));
    return this.findOne(businessLine, id);
  }

  async remove(businessLine: string, id: number) {
    const tables = getBusinessLineTables(businessLine);
    await this.findOne(businessLine, id);
    await this.drizzle.db
      .delete(tables.schemes)
      .where(eq(tables.schemes.id, id));
    return { deleted: true };
  }
}
