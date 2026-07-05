import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from './schema/users';
import { casTickets } from './schema/cas-tickets';
import { casServices } from './schema/cas-services';
import { casTicketsRelations, usersRelations } from './relations';

// 显式 schema 类型 — 避免 ReturnType<typeof drizzle> 默认推成 Record<string, never>
// 这样 db.query.users / db.query.casTickets 都有类型
type Schema = {
  users: typeof users;
  casTickets: typeof casTickets;
  casServices: typeof casServices;
  usersRelations: typeof usersRelations;
  casTicketsRelations: typeof casTicketsRelations;
};

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  // 用显式 NodePgDatabase<Schema>,让 db.query.* / with:* 类型推断出来
  public db!: NodePgDatabase<Schema>;
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    // Zod 已校验 DATABASE_URL 必填 + 是 URL,getOrThrow 保证 runtime 拿到 string
    const databaseUrl = this.config.getOrThrow<string>('DATABASE_URL');
    this.pool = new Pool({
      connectionString: databaseUrl,
      // 0063 连接池调优 - 企业级配置
      max: this.config.get<number>('DB_POOL_MAX') || 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
      query_timeout: 30000,
      idle_in_transaction_session_timeout: 60000,
      maxLifetimeSeconds: 3600,
      application_name: 'nest-search-auth',
    });

    this.db = drizzle(this.pool, {
      schema: { users, casTickets, casServices, usersRelations, casTicketsRelations },
    });

    await this.seedServices();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private async seedServices() {
    const services = [
      { serviceId: 'auth-frontend', serviceUrl: 'http://auth.localhost:3100/auth-callback', name: '认证中心' },
      { serviceId: 'ds-frontend', serviceUrl: 'http://ds.localhost:3101/auth-callback', name: '商显前端' },
      { serviceId: 'zk-frontend', serviceUrl: 'http://zk.localhost:3102/auth-callback', name: '道闸前端' },
      { serviceId: 'meeting-frontend', serviceUrl: 'http://meeting.localhost:3103/auth-callback', name: '会议前端' },
    ];

    for (const svc of services) {
      // Postgres 等价:onConflictDoUpdate 替代 mysql2 的 onDuplicateKeyUpdate
      await this.db.insert(casServices)
        .values(svc)
        .onConflictDoUpdate({
          target: casServices.serviceId,
          set: { name: svc.name },
        });
    }
  }
}
