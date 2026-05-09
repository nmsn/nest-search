import { mysqlTable, int, varchar, timestamp, boolean } from 'drizzle-orm/mysql-core';

export const casServices = mysqlTable('cas_services', {
  id: int('id').primaryKey().autoincrement(),
  serviceId: varchar('service_id', { length: 100 }).unique().notNull(),
  serviceUrl: varchar('service_url', { length: 500 }).notNull(),
  name: varchar('name', { length: 100 }),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});
