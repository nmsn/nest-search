import { Injectable, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import { users } from './schema/users';
import { casTickets } from './schema/cas-tickets';
import { casServices } from './schema/cas-services';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  async onModuleInit() {
    const pool = createPool({
      uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search',
    });

    this.db = drizzle(pool, {
      schema: { users, casTickets, casServices },
      mode: 'default',
    });

    await this.seedServices();
  }

  private async seedServices() {
    const services = [
      { serviceId: 'ds-frontend', serviceUrl: 'http://ds.example.local/callback', name: '商显前端' },
      { serviceId: 'zk-frontend', serviceUrl: 'http://zk.example.local/callback', name: '道闸前端' },
      { serviceId: 'meeting-frontend', serviceUrl: 'http://meeting.example.local/callback', name: '会议平板前端' },
    ];

    for (const svc of services) {
      await this.db.insert(casServices)
        .values(svc)
        .onDuplicateKeyUpdate({ set: { name: svc.name } });
    }
  }
}
