import { z } from "zod";

/**
 * gateway env schema — 公共字段 inline(详见 auth-service env.schema 注释)
 */
export const GatewayEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("2h"),
  CAS_COOKIE_DOMAIN: z.string().default(".example.local"),
  CAS_TGT_EXPIRES_IN: z.string().default("8h"),
  CAS_ST_EXPIRES_IN: z.string().default("30s"),

  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  API_KEY_DS: z.string().default("ds_key_123"),
  API_KEY_ZK: z.string().default("zk_key_456"),
  API_KEY_MEETING: z.string().default("meeting_key_789"),
  AUTH_SERVICE_URL: z.string().url().default("http://localhost:3004"),
  SEARCH_SERVICE_URL: z.string().url().default("http://localhost:3002"),
  SYNC_SERVICE_URL: z.string().url().default("http://localhost:3001"),
  FORM_SERVICE_URL: z.string().url().default("http://localhost:3003"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("604800"),
});

export type GatewayEnv = z.infer<typeof GatewayEnvSchema>;
