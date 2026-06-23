import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import { syncRecords } from '../libs/shared/index';
import { desc } from 'drizzle-orm';

@Injectable()
export class SyncRecordsService {
  private db: ReturnType<typeof drizzle>;

  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const pool = createPool({ uri: databaseUrl });
    this.db = drizzle(pool);
  }

  async findAll() {
    return this.db.select().from(syncRecords).orderBy(desc(syncRecords.createdAt)).limit(50);
  }
}
