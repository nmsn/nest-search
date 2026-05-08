import { mysqlTable, int, varchar, text, json, decimal, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

function createSchemesTable(prefix: string) {
  return mysqlTable(`${prefix}schemes`, {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', ['draft', 'published', 'archived']).default('draft'),
    config: json('config'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  });
}

function createFormsTable(prefix: string) {
  return mysqlTable(`${prefix}forms`, {
    id: int('id').primaryKey().autoincrement(),
    schemeId: int('scheme_id').notNull(),
    productIds: json('product_ids').$type<string[]>().notNull(),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    totalQuantity: int('total_quantity').notNull(),
    status: mysqlEnum('status', ['draft', 'submitted', 'approved']).default('draft'),
    formData: json('form_data').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  });
}

export const TABLES = {
  ds: {
    schemes: createSchemesTable('ds_'),
    forms: createFormsTable('ds_'),
  },
  zk: {
    schemes: createSchemesTable('zk_'),
    forms: createFormsTable('zk_'),
  },
  meeting: {
    schemes: createSchemesTable('mt_'),
    forms: createFormsTable('mt_'),
  },
} as const;

export type BusinessLineCode = keyof typeof TABLES;

export function getBusinessLineTables(businessLine: string) {
  const tables = TABLES[businessLine as BusinessLineCode];
  if (!tables) throw new Error(`Unknown business line: ${businessLine}`);
  return tables;
}
