import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const businessLines = pgTable('business_lines', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  tablePrefix: varchar('table_prefix', { length: 20 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
