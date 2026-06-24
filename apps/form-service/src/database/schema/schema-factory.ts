import { pgTable, serial, varchar, text, json, numeric, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';

// pg-core enum 必须独立常量
export const schemeStatusEnum = pgEnum('scheme_status', ['draft', 'published', 'archived']);
export const formStatusEnum = pgEnum('form_status', ['draft', 'submitted', 'approved']);

function createSchemesTable(prefix: string) {
  return pgTable(`${prefix}schemes`, {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    status: schemeStatusEnum('status').default('draft'),
    config: json('config'),
    createdAt: timestamp('created_at').defaultNow(),
    // pg-core 没有 .onUpdateNow() — 用 $onUpdate 回调
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()),
  });
}

function createFormsTable(prefix: string) {
  return pgTable(`${prefix}forms`, {
    id: serial('id').primaryKey(),
    schemeId: integer('scheme_id').notNull(),
    productIds: json('product_ids').$type<string[]>().notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    totalQuantity: integer('total_quantity').notNull(),
    status: formStatusEnum('status').default('draft'),
    formData: json('form_data').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()),
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
