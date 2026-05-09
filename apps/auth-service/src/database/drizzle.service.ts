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
      { serviceId: 'auth-frontend', serviceUrl: 'http://auth.localhost:3100/auth-callback', name: '认证中心' },
      { serviceId: 'ds-frontend', serviceUrl: 'http://ds.localhost:3101/auth-callback', name: '商显前端' },
      { serviceId: 'zk-frontend', serviceUrl: 'http://zk.localhost:3102/auth-callback', name: '道闸前端' },
      { serviceId: 'meeting-frontend', serviceUrl: 'http://meeting.localhost:3103/auth-callback', name: '会议前端' },
    ];

    for (const svc of services) {
      await this.db.insert(casServices)
        .values(svc)
        .onDuplicateKeyUpdate({ set: { name: svc.name } });
    }
  }
}
