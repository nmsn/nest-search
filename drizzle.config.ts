import type { Config } from 'drizzle-kit';

export default {
  schema: [
    './apps/auth-service/src/database/schema/**/*.ts',
    './apps/form-service/src/database/schema/**/*.ts',
  ],
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    url: 'mysql://root:root123@localhost:3306/nest_search',
  },
} satisfies Config;