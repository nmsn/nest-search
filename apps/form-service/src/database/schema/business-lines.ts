import { mysqlTable, int, varchar, timestamp } from 'drizzle-orm/mysql-core';

export const businessLines = mysqlTable('business_lines', {
  id: int('id').primaryKey().autoincrement(),
  code: varchar('code', { length: 50 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  tablePrefix: varchar('table_prefix', { length: 20 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
