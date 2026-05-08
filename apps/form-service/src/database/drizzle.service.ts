import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import * as schema from './schema/schema-factory';
import { businessLines } from './schema/business-lines';
import { syncRecords } from '@app/shared';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  async onModuleInit() {
    const pool = createPool({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });

    this.db = drizzle(pool, {
      schema: { ...schema, businessLines, syncRecords },
      mode: 'default',
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
      await this.db.insert(businessLines)
        .values(line)
        .onDuplicateKeyUpdate({ set: { name: line.name } });
    }
  }
}
