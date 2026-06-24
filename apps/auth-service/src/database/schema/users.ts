import { pgTable, serial, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// pg-core 的 enum 必须独立常量(不像 mysql-core 内联)
export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  email: varchar('email', { length: 100 }),
  role: userRoleEnum('role').default('user'),
  status: userStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  // pg-core 没有 .onUpdateNow() — 用 $onUpdate 回调让 Drizzle 在 UPDATE 时自动加
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()),
});
