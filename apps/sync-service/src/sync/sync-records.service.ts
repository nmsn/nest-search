import { Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import { syncRecords } from '../libs/shared/index';
import { desc } from 'drizzle-orm';

@Injectable()
export class SyncRecordsService {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const pool = createPool({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });
    this.db = drizzle(pool);
  }

  async findAll() {
    return this.db.select().from(syncRecords).orderBy(desc(syncRecords.createdAt)).limit(50);
  }
}
