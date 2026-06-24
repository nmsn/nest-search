import { pgTable, serial, varchar, timestamp, pgEnum, boolean, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const casTicketTypeEnum = pgEnum('cas_ticket_type', ['TGT', 'ST']);

export const casTickets = pgTable('cas_tickets', {
  id: serial('id').primaryKey(),
  ticket: varchar('ticket', { length: 255 }).unique().notNull(),
  type: casTicketTypeEnum('type').notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  service: varchar('service', { length: 500 }),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
