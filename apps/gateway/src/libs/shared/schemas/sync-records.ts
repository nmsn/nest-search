import { mysqlTable, int, text, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const syncRecords = mysqlTable('sync_records', {
  id: int('id').primaryKey().autoincrement(),
  type: mysqlEnum('type', ['incremental', 'full']).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'success', 'failed']).default('pending'),
  recordsCount: int('records_count').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
