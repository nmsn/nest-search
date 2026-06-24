import { relations } from 'drizzle-orm';
import { users } from './schema/users';
import { casTickets } from './schema/cas-tickets';

// 一个用户有多个 ticket(1:N)
export const usersRelations = relations(users, ({ many }) => ({
  casTickets: many(casTickets),
}));

// 一个 ticket 属于一个用户(N:1)
export const casTicketsRelations = relations(casTickets, ({ one }) => ({
  user: one(users, {
    fields: [casTickets.userId],
    references: [users.id],
  }),
}));