import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../schema/users";

/**
 * 从 users 表 schema 自动推断 Zod schema(0022)
 * 单一 source of truth:DB schema 改 → DTO 自动跟上
 */

// DB 层 schema — 包含 passwordHash(由 service 层 bcrypt 后写入)
export const InsertUserDbSchema = createInsertSchema(users, {
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).default("user"),
});

export const SelectUserDtoSchema = createSelectSchema(users);

// API 层 schema — 直接定义,接受明文 password(0022 lesson §3.5)
// 注意:drizzle-zod 的 omit/extend 在 0.8.x 推断有问题,所以手写
// 但字段名仍然跟 DB schema 对齐(单一 source of truth 原则)
export const RegisterApiSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).optional(),
});

export type InsertUserDb = z.infer<typeof InsertUserDbSchema>;
export type RegisterApi = z.infer<typeof RegisterApiSchema>;
export type SelectUserDto = z.infer<typeof SelectUserDtoSchema>;
