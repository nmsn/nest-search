# 0068 · tRPC 理论:TypeScript 端到端类型安全的 RPC

> Phase F 第 1 课。nest-search 当前跨服务调用是 **HTTP/REST + nestjs/axios + 字符串路径 + `any` body**,完全无类型保护。本节引入 **tRPC** —— 2021 GA、TS 端到端类型安全、有成熟 NestJS 社区 adapter。**纯理论**,0069 实战迁移。

## 你今天会拿到什么

1. 理解 tRPC **是什么 / 定位**
2. 理解 tRPC vs **oRPC / gRPC / REST** 的区别
3. 掌握 tRPC **4 个核心概念**(procedure / router / AppRouter / context)
4. 掌握 **initTRPC.create() 工厂模式**
5. 掌握 **tRPC + NestJS 集成模式**
6. 掌握 tRPC **client 用法**
7. nest-search 改造路径概览(0069 详情)
8. **0 改动**,仅 lesson 文档

---

## §1. 业务问题

### 1.1 nest-search 当前跨服务调用的 4 个痛点

```ts
// apps/gateway/src/proxy/proxy.service.ts
async forward(service: string, method: string, path: string, body?: any) {
  return this.httpClient.request({
    method,
    url: `${SERVICE_URLS[service]}${path}`,
    data: body,  // ← any 类型!
  });
}

// 调用方
const res = await this.proxyService.forward(
  'auth',
  'POST',
  '/api/auth/login',  // ← 字符串路径,改了就崩
  { username: 'foo', passwrd: 'bar' },  // ← 字段拼写错误不报错
);
```

**4 个痛点**:

| 痛点 | 后果 |
|---|---|
| 字符串路径 | 改 path 不报错,运行时崩 |
| `any` body | 字段拼写错误不报错,运行时崩 |
| 无 response 类型 | 返回值 `any`,后续代码全是 `any` |
| 无服务端校验 | server 端不知道 client 发了什么,500 满天飞 |

### 1.2 tRPC 怎么解

```ts
// auth.router.ts(单一类型源)
const authRouter = router({
  login: publicProcedure
    .input(z.object({
      username: z.string(),
      password: z.string(),  // ← 拼写错误立即 TS 报错
    }))
    .mutation(async ({ input }) => { ... }),
});

// gateway 调用
const res = await trpc.auth.login.mutate({ username: 'foo', password: 'bar' });
//         ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑ 类型从 AppRouter 自动推断
//         改 server → gateway 立即编译报错
```

**端到端类型安全**:server 写 AppRouter,client 通过 TS 推断拿到完整类型,改 server → client 编译失败。

---

## §2. tRPC 是什么

### 2.1 定义

> **tRPC** 是 Vercel 出品的 **TypeScript-first 端到端类型安全 RPC 框架**,2021 年 GA,目前 v11。

**核心特性**:
- 无需 codegen(直接 TS 推断)
- Zod / Yup / Valibot / ArkType / Superstruct 全支持
- 多传输:HTTP / WebSocket / Server-side call(同进程)
- **官方 React / Next.js 集成**
- **社区 NestJS 集成**(`@nestjs-trpc/nestjs-trpc`)
- OpenAPI 自动生成(可选)

### 2.2 定位

```
TS 生态 RPC 选型:

1. tRPC(成熟,2021 GA,v11)
   - 类型安全 ✅
   - 无 codegen ✅
   - 性能 ⚠️(server 解析开销,fetchBatchLink 单次请求开销大)
   - 跨语言 ❌
   - Vercel / 大部分 TS 全栈公司用

2. oRPC(新派,2024 GA)
   - 类型安全 ✅
   - 无 codegen ✅
   - 性能 ⭐(比 tRPC 好)
   - 跨语言 ❌
   - NestJS adapter 不成熟
   - 案例少

3. gRPC(老牌,2015 GA)
   - 跨语言 ✅✅✅
   - 性能 ⭐⭐⭐⭐⭐
   - 需要 codegen
   - .proto 文件
   - 大厂 90% 选这个
```

**tRPC = 行业事实标准**,oRPC 是挑战者但生态不及。

---

## §3. tRPC vs oRPC vs gRPC vs REST(4 列对比)

| 维度 | tRPC | oRPC | gRPC | REST |
|---|---|---|---|---|
| **作者** | Vercel / Alex Johansson | unnoq | Google | Roy Fielding |
| **GA 年份** | 2021(v11) | 2024 | 2015 | 2000 |
| **跨语言** | ❌(可生成 OpenAPI) | ❌(可桥接 gRPC) | ✅✅ | ✅ |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **无 codegen** | ✅ | ✅ | ❌(.proto) | ❌(OpenAPI 可选) |
| **Zod 集成** | ✅ 一等公民 | ✅ | ❌ | ⚠️ 手动 |
| **Streaming** | ✅ Subscription | ✅ | ✅ | ❌ |
| **OpenAPI 生成** | ✅ 自动 | ✅ | ❌ | ⚠️ 手动 |
| **NestJS 集成** | ✅ 社区成熟 | ⚠️ 自己写 | ❌ | ✅ |
| **React / Next.js 集成** | ✅✅ 一等公民 | ⚠️ | ❌ | ✅ |
| **学习曲线** | 平 | 平 | 陡 | 平 |
| **大厂用吗** | ✅ Vercel / 小公司 | ⚠️ 新 | ✅✅ 大厂 90% | ✅ 全部 |
| **nest-search 适合** | ✅ TS 全栈 | ⚠️ NestJS 弱 | ❌ 杀鸡用牛刀 | ⚠️ 无类型保护 |

**关键差异**:
- **REST 通用但无类型**:nest-search 当前用的就是它
- **tRPC 行业标准**:NestJS 有成熟 adapter,Vercel 一等公民支持
- **oRPC 性能更好但生态弱**:NestJS adapter 不成熟,教学价值高
- **gRPC 跨语言 + 性能**:Java/Go 后端首选,TS 生态偏重

---

## §4. 4 个核心概念

### 4.1 Procedure(过程)

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const login = t.procedure
  .input(z.object({                    // ← 输入 schema(Zod)
    username: z.string(),
    password: z.string().min(6),
  }))
  .output(z.object({                   // ← 输出 schema(可选)
    accessToken: z.string(),
    user: z.object({
      id: z.number(),
      username: z.string(),
    }),
  }))
  .mutation(async ({ input, ctx }) => {  // ← mutation = POST
    const user = await db.findUser(input.username);
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return {
      accessToken: jwt.sign({ sub: user.id }),
      user: { id: user.id, username: user.username },
    };
  });

// 另一种:.query = GET(无副作用)
const me = t.procedure
  .input(z.object({ token: z.string() }))
  .query(async ({ input, ctx }) => {
    return db.findUserById(jwt.verify(input.token).sub);
  });
```

**tRPC 强分 `.query()`(GET) vs `.mutation()`(POST)** —— oRPC 不强分。

### 4.2 Router(路由)

```ts
const authRouter = t.router({
  login,            // mutation
  register,
  logout,
  me,               // query
});

// 嵌套 router
const appRouter = t.router({
  auth: authRouter,
  search: searchRouter,
  form: formRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;  // ← 关键:client 端 import 这个类型
```

### 4.3 AppRouter(类型导出,核心!)

```ts
// server 端导出 AppRouter
export type AppRouter = typeof appRouter;

// client 端 import 类型,不 import 实现
import type { AppRouter } from 'auth-service/src/trpc/app-router';

const trpc = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://auth-service:3004/trpc' })],
});

// trpc.auth.login.mutate(...)  ← 类型从 AppRouter 推断
// trpc.auth.me.query(...)        ← 同理
```

**AppRouter 是 tRPC 的灵魂** —— 单一类型源,跨 service / 跨进程共享。

### 4.4 Context(上下文)

```ts
// server 端定义 context 创建器
const createContext = async ({ req, res }) => {
  const user = await extractUserFromJwt(req.headers.authorization);
  return {
    user,                    // 自动注入每个 procedure
    requestId: req.headers['x-request-id'] as string,
    db,
  };
};

const t = initTRPC.context<Context>().create();

// procedure 拿 context
.mutation(async ({ input, ctx }) => {
  console.log(ctx.requestId);  // 来自 gateway
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return ctx.db.findUser(input.username);
});
```

**context 是跨 procedure 共享的"请求级"数据**(类比 Express 的 `req`)。

---

## §5. initTRPC.create() 工厂模式(tRPC 跟 oRPC 的关键区别)

### 5.1 oRPC 的写法(没有"工厂")

```ts
import { os } from '@orpc/server';

const os = os.$context<Context>();  // 全局一个 os
const login = os.input(z.x).handler(...);
```

### 5.2 tRPC 的写法(工厂模式,可配置 middleware)

```ts
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.context<Context>().create();  // 工厂
//                   ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
//                     可以在这里加 middleware
```

**tRPC 的优势**:**统一管理 middleware**(鉴权 / 日志 / 监控)。

```ts
// 鉴权 middleware
const authedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// 受保护 procedure
const authedProcedure = t.procedure.use(authedMiddleware);

// 用
const getProfile = authedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input, ctx }) => {
    return ctx.db.findUser(input.id);  // ctx.user 一定有
  });
```

**nest-search 适合场景**:
- 公共 procedure:`t.procedure`(任何调用方)
- 受保护 procedure:`authedProcedure`(需要 JWT)

---

## §6. tRPC + NestJS 集成

### 6.1 社区 adapter:`@nestjs-trpc/nestjs-trpc`

```bash
pnpm add @nestjs-trpc/nestjs-trpc @trpc/server zod
```

### 6.2 server 端(用 NestJS 装饰器)

```ts
// apps/auth-service/src/trpc/auth.trpc.controller.ts
import { TrpcProcedure, TrpcRouter } from '@nestjs-trpc/nestjs-trpc';
import { z } from 'zod';
import { UserService } from '../user/user.service';
import { TRPCError } from '@trpc/server';

@TrpcRouter()  // ← 装饰器声明这是 tRPC router
export class AuthRouter {
  constructor(private readonly userService: UserService) {}

  @TrpcProcedure({               // ← 装饰器声明 procedure
    method: 'POST',              // mutation
    input: z.object({            // Zod schema
      username: z.string(),
      password: z.string().min(6),
    }),
    path: 'login',               // 路径 = auth.login
  })
  async login(@TrpcContext() ctx: { user?: any; requestId: string }) {
    // delegate 到现有 service
    const user = await this.userService.validatePassword(
      input.username,
      input.password,
    );
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    return {
      accessToken: jwt.sign({ sub: user.id }),
      user: { id: user.id, username: user.username },
    };
  }
}
```

**关键点**:
- `@TrpcRouter` 装饰器让 NestJS 识别这是 tRPC 路由
- `@TrpcProcedure` 装饰器声明 procedure 的 path / method / input
- 内部还是 NestJS DI(UserService 注入)
- 业务逻辑 0 改动,delegate 给现有 service

### 6.3 module 注册

```ts
// apps/auth-service/src/trpc/auth.trpc.module.ts
import { TrpcModule } from '@nestjs-trpc/nestjs-trpc';

@Module({
  imports: [
    TrpcModule.forRoot({          // ← 全局注册
      autoSchema: true,           // 自动生成 AppRouter
    }),
  ],
  controllers: [AuthRouter],      // ← 暴露 router
})
export class AuthTrpcModule {}
```

挂载后:`POST http://localhost:3004/trpc/auth.login`

---

## §7. tRPC client 用法

### 7.1 跨进程 HTTP client

```ts
// apps/gateway/src/trpc/trpc-client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from 'auth-service/src/trpc/app-router';

// 单 client(简单场景)
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://auth-service:3004/trpc',
      headers: () => ({
        'x-request-id': req.id,         // 从 express req 拿
        authorization: req.headers.authorization,
      }),
    }),
  ],
});
```

### 7.2 多个 service 多个 client

```ts
import type { AppRouter as AuthRouter } from 'auth-service/src/trpc/app-router';
import type { AppRouter as SearchRouter } from 'search-service/src/trpc/app-router';

const authTrpc = createTRPCProxyClient<AuthRouter>({
  links: [httpBatchLink({ url: `${AUTH_URL}/trpc` })],
});
const searchTrpc = createTRPCProxyClient<SearchRouter>({
  links: [httpBatchLink({ url: `${SEARCH_URL}/trpc` })],
});

// 调用
const { accessToken } = await authTrpc.auth.login.mutate({
  username: 'foo', password: 'bar',
});

const products = await searchTrpc.search.products.query({
  businessLine: 'auth-frontend',
  page: 1,
});
```

### 7.3 server-side call(同进程)

```ts
// 同 NestJS app,直接 import router 函数,不经过 HTTP
import { appRouter } from './app-router';
import { createCallerFactory } from '@trpc/server';

const createCaller = createCallerFactory(appRouter);
const caller = await createCaller({ user, requestId });

const res = await caller.auth.login({ username: 'foo', password: 'bar' });
// 零网络,直接函数调用
```

### 7.4 错误处理

```ts
import { TRPCError } from '@trpc/server';
import { TRPCClientError } from '@trpc/client';

try {
  await authTrpc.auth.login.mutate({ username: 'foo', password: 'wrong' });
} catch (e) {
  if (e instanceof TRPCClientError) {
    // e.data.code: 'UNAUTHORIZED' | 'BAD_REQUEST' | 'NOT_FOUND' | ...
    // e.data.httpStatus: HTTP status code
    // e.message: 业务错误消息
  }
}
```

**比 REST + 各种 HttpException 统一**。

---

## §8. nest-search 改造路径(0069 详情)

### 8.1 改造前(现状)

```
gateway(唯一 client)
  ├─→ HttpClientService + ProxyService.forward()
  ├─→ 18 个调用点全在 app.controller.ts + auth-proxy.controller.ts
  └─→ 字符串路径 + any body
form / search / sync:无 outbound HTTP
```

### 8.2 改造后

```
gateway
  ├─→ 4 个 typed tRPC client(auth / search / form / sync)
  └─→ 18 个调用点改成 authTrpc.auth.login.mutate({...}) 等
  └─→ TS 编译期类型保护

4 个 backend service
  └─→ 各加一个 TrpcModule,挂在 /trpc
  └─→ 用 @nestjs-trpc/nestjs-trpc 装饰器
  └─→ delegate 到现有 service 方法(业务代码 0 改动)
```

### 8.3 顺手清理技术债

```
❌ 5 个 apps/*/src/libs/shared/ 副本
   → 删除,统一引真实 libs/shared/src
   → tRPC AppRouter 类型强制单一类型源

❌ HttpClientService / ProxyService / @nestjs/axios
   → 删除,tRPC client 自带 fetch

❌ *_SERVICE_URL env(部分)
   → 保留(给 tRPC client baseURL 用)
```

### 8.4 工作量预估

```
1. lesson(本节)        ← 你现在
2. install + 删副本    30 min
3. 4 个 router 文件    1-2 hour
4. 4 个 TrpcModule     1 hour
5. gateway 改 client   2-3 hour
6. 删除旧代码           30 min
7. 测试 + 调试          1-2 hour
                       ──────────
                       总: 6-9 hour(分 2-3 天)
```

---

## §9. Quiz

**Q1: tRPC 的核心优势是?**

A) 性能比 gRPC 强
B) TS 端到端类型安全 + 无 codegen + NestJS 生态成熟
C) 跨语言

**Q2: nest-search 适合用 tRPC 吗?**

A) 不适合,应该用 gRPC
B) 适合,全 TS 单体 + NestJS 有社区 adapter + 需要类型保护
C) 不适合,应该用 REST

**Q3: tRPC 的 AppRouter 放哪里?**

A) 每个 service 单独放
B) libs/shared/src/contracts/(单一类型源)
C) 不需要 AppRouter,直接 import server 端

---

## §10. 跨节链接

- [0067 · 微服务 DB per Service](./0067-microservice-database.md) — Phase E 收官
- [0069 · tRPC 实战](./0069-trpc-migration.md) — 下一课(实战迁移)
- [tRPC 官方文档](https://trpc.io) — 参考
- [@nestjs-trpc 社区包](https://github.com/KaiserBabel/nestjs-trpc) — NestJS adapter