import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { syncRecords } from '../libs/shared/index';
import { desc } from 'drizzle-orm';

@Injectable()
export class SyncRecordsService {
  private db: ReturnType<typeof drizzle>;

  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(pool);
  }

  async findAll() {
    return this.db.select().from(syncRecords).orderBy(desc(syncRecords.createdAt)).limit(50);
  }
}
