import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/schema-factory';
import { businessLines } from './schema/business-lines';
import { syncRecords } from '../libs/shared/index';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.getOrThrow<string>('DATABASE_URL');
    const pool = new Pool({ connectionString: databaseUrl });

    this.db = drizzle(pool, {
      schema: { ...schema, businessLines, syncRecords },
    });

    await this.initBusinessLines();
  }

  private async initBusinessLines() {
    const lines = [
      { code: 'ds', name: '商显', tablePrefix: 'ds_' },
      { code: 'zk', name: '道闸', tablePrefix: 'zk_' },
      { code: 'meeting', name: '会议平板', tablePrefix: 'mt_' },
    ];

    for (const line of lines) {
      // Postgres 等价:onConflictDoUpdate 替代 mysql2 的 onDuplicateKeyUpdate
      await this.db.insert(businessLines)
        .values(line)
        .onConflictDoUpdate({
          target: businessLines.code,
          set: { name: line.name },
        });
    }
  }
}
