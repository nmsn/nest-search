import { z } from "zod";

/**
 * auth-service env schema
 * 注:0020 原本计划抽 BaseEnvSchema 到 libs/shared,但 monorepo 没装 build
 * orchestration(Turbo/Nx),cross-package import 在 nest start 时 fail
 * (Cannot find module)。inline 公共字段是当前 monorepo 状态下的正解。
 * 改完记得保持 5 个 service 的公共字段同步(NODE_ENV / LOG_LEVEL /
 * JWT_SECRET / JWT_EXPIRES_IN / CAS_*)。
 */
export const AuthEnvSchema = z.object({
  // 公共字段
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("2h"),
  CAS_COOKIE_DOMAIN: z.string().default(".example.local"),
  CAS_TGT_EXPIRES_IN: z.string().default("8h"),
  CAS_ST_EXPIRES_IN: z.string().default("30s"),

  // auth-service 私有字段
  DATABASE_URL: z
    .string()
    .url()
    .default("mysql://root:root123@localhost:3306/nest_search"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("604800"),
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3004),
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;
