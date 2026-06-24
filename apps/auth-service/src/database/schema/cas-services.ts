import { pgTable, serial, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const casServices = pgTable('cas_services', {
  id: serial('id').primaryKey(),
  serviceId: varchar('service_id', { length: 100 }).unique().notNull(),
  serviceUrl: varchar('service_url', { length: 500 }).notNull(),
  name: varchar('name', { length: 100 }),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});
