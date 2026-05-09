import { mysqlTable, int, varchar, timestamp, mysqlEnum, boolean } from 'drizzle-orm/mysql-core';
import { users } from './users';

export const casTickets = mysqlTable('cas_tickets', {
  id: int('id').primaryKey().autoincrement(),
  ticket: varchar('ticket', { length: 255 }).unique().notNull(),
  type: mysqlEnum('type', ['TGT', 'ST']).notNull(),
  userId: int('user_id').notNull().references(() => users.id),
  service: varchar('service', { length: 500 }),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
