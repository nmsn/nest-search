import { Logger } from "@nestjs/common";
import { FormEnvSchema, FormEnv } from "./env.schema";

export function validateEnv(config: Record<string, unknown>): FormEnv {
  const result = FormEnvSchema.safeParse(config);
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
