import { z } from "zod";

/**
 * search-service env schema — 公共字段 inline
 */
export const SearchEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("2h"),
  CAS_COOKIE_DOMAIN: z.string().default(".example.local"),
  CAS_TGT_EXPIRES_IN: z.string().default("8h"),
  CAS_ST_EXPIRES_IN: z.string().default("30s"),

  SEARCH_SERVICE_PORT: z.coerce.number().int().positive().default(3002),
  ELASTICSEARCH_NODE: z.string().url().default("http://localhost:9200"),
});

export type SearchEnv = z.infer<typeof SearchEnvSchema>;
