import { PipeTransform, BadRequestException } from "@nestjs/common";
import { ZodSchema } from "zod";

/**
 * 通用 Zod validation pipe(0022)
 * 替代 nestjs-zod 依赖,手写足够轻量
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
