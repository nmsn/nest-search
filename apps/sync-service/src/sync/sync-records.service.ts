import { Injectable } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2';
import { syncRecords } from '@app/shared';
import { desc } from 'drizzle-orm';

@Injectable()
export class SyncRecordsService {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const connection = createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });
    this.db = drizzle(connection);
  }

  async findAll() {
    return this.db.select().from(syncRecords).orderBy(desc(syncRecords.createdAt)).limit(50);
  }
}
