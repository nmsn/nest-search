import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { JwtPayload } from '../interfaces/user.interface';

/**
 * 共享 tRPC context 类型 — 所有 backend service 的 procedure 都能拿到
 *
 * 字段说明:
 *   - requestId: gateway 传来的 x-request-id,用于日志链路追踪
 *   - user: 从 JWT 头解析的当前用户(gateway 转发时携带)
 */
export interface TrpcContext {
  requestId: string;
  user?: JwtPayload | null;
}

/**
 * 共享 tRPC 初始化器 — 所有 backend service 都用这个 t
 *
 * 为什么不每 service 自己 initTRPC?
 *   - 统一 context 类型(改一处,所有 service 跟上)
 *   - 统一 error formatter
 *   - 未来加 middleware(鉴权/日志/监控)一处加,所有 service 生效
 */
export const trpc = initTRPC.context<TrpcContext>().create();

/**
 * Auth Service 的 tRPC contract
 *
 * 5 个 procedure(对应 gateway auth-proxy.controller.ts 调用的 5 个方法):
 *   - register: 用户注册
 *   - login:    用户登录
 *   - validate: 校验 token(用于 CAS ticket 校验)
 *   - logout:   登出
 *   - me:       获取当前用户信息(需要 Bearer token)
 *
 * Contract-first 模式:
 *   - 此文件定义 contract(Zod schemas + procedure 签名)
 *   - auth-service 的 TrpcModule 实现这些 procedure
 *   - gateway 用 AppRouter 类型推断 client,改这里 → gateway 立即编译报错
 */

// ─── Schemas ───

// Register / Login 的 schema 跟 auth-service/src/database/dto/users.dto.ts 保持一致
// 这里**重复定义**而不是 import,因为 libs/shared 不能反向依赖 apps/
const RegisterInputSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

const LoginInputSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

const ValidateInputSchema = z.object({
  ticket: z.string(),
  service: z.string(),
});
export type ValidateInput = z.infer<typeof ValidateInputSchema>;

// Output schemas
const UserOutputSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  status: z.string().optional(),
});
export type UserOutput = z.infer<typeof UserOutputSchema>;

const LoginOutputSchema = z.object({
  accessToken: z.string(),
  user: UserOutputSchema,
});
export type LoginOutput = z.infer<typeof LoginOutputSchema>;

const MeOutputSchema = z.object({
  user: UserOutputSchema.nullable(),
});
export type MeOutput = z.infer<typeof MeOutputSchema>;

const LogoutOutputSchema = z.object({
  message: z.string(),
});
export type LogoutOutput = z.infer<typeof LogoutOutputSchema>;

// ─── Procedure 签名定义 ───
// 这里用 trpc.procedure 声明 procedure 的形状(输入/输出 schema),
// server 端实现这些 procedure 时复用这些 schema,client 端类型推断从这里拿。

/**
 * procedure 工厂 — auth-service 实现 contract 时用这个
 *
 * 用法:
 *   import { authContract } from '@app/shared/contracts/auth.contract';
 *   const router = authContract.router({
 *     register: authContract.procedure
 *       .input(RegisterInputSchema)
 *       .output(RegisterOutputSchema)
 *       .mutation(async ({ input }) => { ... }),
 *     ...
 *   });
 *
 * 注:这里我们直接导出 schema + 用 initTRPC 创建的 trpc 实例,
 *   server 端 import trpc + schemas 自己组合 router。这样比
 *   定义 "ContractBuilder" 模式简单。
 */
export const authSchemas = {
  RegisterInput: RegisterInputSchema,
  LoginInput: LoginInputSchema,
  ValidateInput: ValidateInputSchema,
  UserOutput: UserOutputSchema,
  LoginOutput: LoginOutputSchema,
  MeOutput: MeOutputSchema,
  LogoutOutput: LogoutOutputSchema,
};

// 导出 trpc 实例和 procedures 的"类型形状" — 由下面的 appRouter 定义导出
// (AuthRouterShape 在初版设计中已废弃,见 appRouter + AppRouter 类型导出)

/**
 * Auth 服务通用错误码 — server 实现时 throw TRPCError({ code, message })
 */
export const AuthErrors = {
  UsernameConflict: () =>
    new TRPCError({ code: 'CONFLICT', message: '用户名已存在' }),
  InvalidCredentials: () =>
    new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' }),
  TokenInvalid: () =>
    new TRPCError({ code: 'UNAUTHORIZED', message: 'token 无效或已过期' }),
  UserNotFound: (id: number) =>
    new TRPCError({ code: 'NOT_FOUND', message: `User ${id} not found` }),
  UserDisabled: (id: number) =>
    new TRPCError({ code: 'FORBIDDEN', message: `User ${id} is disabled` }),
} as const;

// ─── AppRouter Shape ───
// 这里用 trpc.router() 静态定义 procedure 的"形状"(input/output),
// 给 client 端做端到端类型推断用。
//
// 注意:这只是 type stub,业务实现由 auth-service 用 @nestjs-trpc 装饰器提供,
//      实际运行时不会调用这里的 handler body。
//
// 当 server 实现跟 shape 不一致时,client 端 TS 编译会报错 —
// 这就是端到端类型安全的"灵魂"。

const ValidateOutputSchema = z.object({
  valid: z.boolean(),
  user: UserOutputSchema.optional(),
});

export const appRouter = trpc.router({
  auth: trpc.router({
    register: trpc.procedure
      .input(RegisterInputSchema)
      .output(UserOutputSchema)
      .mutation(() => {
        throw new Error('Stub - implemented via @Mutation decorator');
      }),

    login: trpc.procedure
      .input(LoginInputSchema)
      .output(LoginOutputSchema)
      .mutation(() => {
        throw new Error('Stub - implemented via @Mutation decorator');
      }),

    validate: trpc.procedure
      .input(ValidateInputSchema)
      .output(ValidateOutputSchema)
      .mutation(() => {
        throw new Error('Stub - implemented via @Mutation decorator');
      }),

    logout: trpc.procedure
      .output(LogoutOutputSchema)
      .mutation(() => {
        throw new Error('Stub - implemented via @Mutation decorator');
      }),

    me: trpc.procedure
      .output(MeOutputSchema)
      .query(() => {
        throw new Error('Stub - implemented via @Query decorator');
      }),
  }),
});

/**
 * AppRouter 类型 — gateway client 端 import 这个做类型推断
 *
 * 用法(gateway):
 *   import type { AppRouter } from '@app/shared/contracts';
 *   const client = createTRPCProxyClient<AppRouter>({...});
 *   const res = await client.auth.login.mutate({ username, password });
 *   //     ↑ 类型从 AppRouter 自动推断,改 contract → gateway 立即编译报错
 */
export type AppRouter = typeof appRouter;
