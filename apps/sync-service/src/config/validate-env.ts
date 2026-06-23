import { Logger } from "@nestjs/common";
import { SyncEnvSchema, SyncEnv } from "./env.schema";

export function validateEnv(config: Record<string, unknown>): SyncEnv {
  const result = SyncEnvSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    Logger.error(
      "❌ Invalid environment variables:",
      JSON.stringify(errors, null, 2),
    );
    throw new Error(
      `Environment validation failed: ${Object.keys(errors).join(", ")}`,
    );
  }
  return result.data;
}
