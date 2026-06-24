import { pgTable, serial, text, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';

export const syncRecordTypeEnum = pgEnum('sync_record_type', ['incremental', 'full']);
export const syncRecordStatusEnum = pgEnum('sync_record_status', [
  'pending',
  'running',
  'success',
  'failed',
]);

export const syncRecords = pgTable('sync_records', {
  id: serial('id').primaryKey(),
  type: syncRecordTypeEnum('type').notNull(),
  status: syncRecordStatusEnum('status').default('pending'),
  recordsCount: integer('records_count').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
