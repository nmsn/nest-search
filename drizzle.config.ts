import type { Config } from 'drizzle-kit';

const DEFAULT_PG_URL = 'postgresql://postgres:postgres123@localhost:5432/nest_search';

export default {
  schema: [
    './apps/auth-service/src/database/schema/**/*.ts',
    './apps/form-service/src/database/schema/**/*.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 用 || 而不是 ??:空字符串 DATABASE_URL 也要 fallback 到默认
    // (?? 只对 undefined/null 触发,空字符串会让 drizzle-kit 拿到 url: '')
    url: process.env.DATABASE_URL || DEFAULT_PG_URL,
  },
} satisfies Config;

