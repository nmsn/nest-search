# 0019 · Zod 配置校验:让服务在启动时 fail-fast

> 副线 3(配置校验)第 1 课。env 拼错一个字母 = 跑到线上才崩。Zod 让它在启动时直接挂,告诉你哪儿错了。

## 导航

- **上一课** · [0018 副线 2 收官 · 跨服务追踪实测](./0018-track2-finale.html) — nest-search 5 service pino 对齐
- **当前课** · 0019(本文件)— Zod 在 auth-service 装上 + fail-fast 实测
- **下一课** · [0020 Zod 推广到 5 个服务 + 抽公共 schema](./0020-zod-promote-shared-schema.md)
- **相关 LR** · [LR-0023 副线 3 第 1 课反思](../learning-records/0023-track3-zod-validation.md)
- **相关参考** · [CURRICULUM.md 总体设计](../CURRICULUM.md) · [MISSION.md 项目使命](../MISSION.md) · [LR-0002 nest-search 缺位盘点](../learning-records/0002-nest-search-inventory.md)
- **本课产物**:
  - `apps/auth-service/src/config/env.schema.ts`(新建)
  - `apps/auth-service/src/config/validate-env.ts`(新建)
  - `apps/auth-service/src/app.module.ts`(改:加 `validate: validateEnv`)

## 你今天会拿到什么

1. 理解**为什么配置校验是企业级底线**(不是 nice-to-have)
2. 区分 **Joi vs Zod**(NestJS 生态的两种选择)
3. 亲手给 **auth-service** 装 Zod schema + ConfigModule 集成
4. 跑一次:**故意改错 env**,看服务在 `NestFactory.create()` 之前挂掉
5. 18 测试还过 + 1 个 commit

## 1. 为什么需要配置校验

看 nest-search 现在怎么读 env:

```ts
// apps/auth-service/src/database/drizzle.service.ts
uri: process.env.DATABASE_URL || 'mysql://root:root123@localhost:3306/nest_search'

// apps/auth-service/src/redis/redis.service.ts
host: process.env.REDIS_HOST || 'localhost',
port: parseInt(process.env.REDIS_PORT || '6379'),
```

**3 个问题**:

1. **缺 env 不会爆**:`process.env.DATABASE_URL` 是 `undefined` 时,`mysql2` 报"connect ECONNREFUSED" —— **你以为是 DB 没起,其实是 env 漏了**。
2. **类型没保证**:`parseInt(process.env.REDIS_PORT || '6379')` 拿到 `'abc'` 会变 `NaN`,下游直接崩在莫名其妙的地方。
3. **跨服务不一致**:gateway / auth / search / sync / form 各自 `|| 'localhost'`,**默认值拼写错一个字母 = 5 个服务全连错地方**。

**配置校验 = 启动时 fail-fast**。env 拼错,**服务根本起不来,直接告诉你哪条 schema 哪条字段错了**。

## 2. Joi vs Zod · 选哪个

NestJS 官方推荐 Joi,但 2024 年后 Zod 越来越主流。

| 维度 | Joi | Zod |
|---|---|---|
| 运行时类型保证 | ❌(`Joi.string()` 不带 TS 类型) | ✅(`z.string()` 推 TS 类型) |
| TS 生态融合 | 一般 | **极好**(drizzle-zod / nestjs-zod / tRPC 通用) |
| Bundle 大小 | 大 | 小(纯 TS 实现) |
| 学习曲线 | 文档多 | 文档新但简洁 |
| 与 Drizzle 集成 | 弱 | **强**(`drizzle-zod` 自动生成 schema) |

**nest-search 选 Zod**。理由:已经在用 Drizzle,`drizzle-zod` 让"数据库表 schema → API DTO schema"一行生成。Joi 做不到这个。

## 3. NestJS 集成方式(2 个选项)

### 选项 A · `nestjs-zod`(推荐)

```ts
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';

const AuthEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // ...
});

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: (config) => AuthEnvSchema.parse(config),
    }),
  ],
})
```

### 选项 B · 手写 validate 函数

```ts
function validateEnv(config: Record<string, unknown>) {
  const result = AuthEnvSchema.safeParse(config);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  return result.data;
}
```

**0019 用选项 B**。理由:不引第三方包,你能看清每一步发生了什么,符合"learn-by-doing"。

## 4. 动手 · 给 auth-service 装 Zod 配置校验

### 4.1 · 看 auth-service 当前所有 env 变量

打开 `apps/auth-service/src/`,grep `process.env` 找出来。**你看到的应该包括**:

```
DATABASE_URL         mysql 连接
REDIS_HOST           redis 主机
REDIS_PORT           redis 端口
JWT_SECRET           JWT 签名密钥
JWT_EXPIRES_IN       JWT 过期时间
CAS_COOKIE_DOMAIN    CAS cookie domain
CAS_TGT_EXPIRES_IN   CAS TGT 过期
CAS_ST_EXPIRES_IN    CAS ST 过期
REFRESH_TOKEN_EXPIRES_IN  refresh token 过期
NODE_ENV             dev / test / prod
LOG_LEVEL            info / debug / warn / error
```

### 4.2 · 创建 `apps/auth-service/src/config/env.schema.ts`

新文件。**不要**照抄 lesson 里的代码 —— 你自己设计 schema:

```ts
import { z } from 'zod';

// 你设计的 schema
export const AuthEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('2h'),

  CAS_COOKIE_DOMAIN: z.string().default('.example.local'),
  CAS_TGT_EXPIRES_IN: z.string().default('8h'),
  CAS_ST_EXPIRES_IN: z.string().default('30s'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('604800'),

  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3004),
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;
```

**关键 API**:
- `z.string().url()` — 必须是 URL 格式
- `z.coerce.number()` — 把字符串自动转 number(`'6379'` → `6379`)
- `z.enum([...])` — 限定取值范围
- `z.string().min(16)` — 最小长度校验
- `.default('localhost')` — 缺省值
- `z.infer<typeof Schema>` — **TS 类型自动推断**,这是 Zod 强于 Joi 的核心

### 4.3 · 写 `validateEnv` 函数

新文件 `apps/auth-service/src/config/validate-env.ts`:

```ts
import { Logger } from '@nestjs/common';
import { AuthEnvSchema, AuthEnv } from './env.schema';

export function validateEnv(config: Record<string, unknown>): AuthEnv {
  const result = AuthEnvSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    Logger.error('❌ Invalid environment variables:', JSON.stringify(errors, null, 2));
    throw new Error(`Environment validation failed: ${Object.keys(errors).join(', ')}`);
  }
  return result.data;
}
```

### 4.4 · 集成到 ConfigModule

改 `apps/auth-service/src/app.module.ts`,加 `validate`:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,  // ← 加这一行
}),
```

### 4.5 · 验证 fail-fast

```bash
# 故意设一个错的 DATABASE_URL
DATABASE_URL="not-a-url" pnpm start:auth
```

期望:**服务根本起不来**,log 里看到:
```
[Nest] ERROR [EnvValidation] ❌ Invalid environment variables:
{
  "DATABASE_URL": ["Invalid url"]
}
Error: Environment validation failed: DATABASE_URL
```

恢复:
```bash
pnpm start:auth  # 正常 env,正常起来
```

### 4.6 · 跑测试还过

```bash
pnpm test
```

期望:`Test Suites: 4 passed / Tests: 18 passed`。

## 5. 设计决策(为什么这样)

| 决策 | 理由 |
|---|---|
| **Zod 而非 Joi** | TS 类型推断 + drizzle-zod 集成 + 跟项目 Drizzle 配套 |
| **手写 validate 而非 nestjs-zod** | 0019 学习目的 = 看清每一步,引第三方包隐藏太多 |
| **fail-fast 在 validate 而非 main.ts** | ConfigModule 是最先初始化的 module,所有下游依赖它 |
| **`z.coerce.number()` 而非 `parseInt`** | 类型安全 + 校验"是不是数字"在前 |
| **`z.string().min(16)` 而非空校验** | JWT_SECRET 太短 = 安全漏洞,启动就该挡 |
| **`.default()` 而非 `\|\|`** | `||` 对 `''` / `0` 失效,Zod `.default()` 严格只在 undefined 时用 |

## 6. 自我检测(3 道题)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. 为什么用 Zod 不用 Joi?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> Joi 不支持 NestJS</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> Zod 的 TS 类型推断跟 Drizzle / nestjs-zod / drizzle-zod 集成更好,跟 nest-search 现有 Drizzle 配套</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> Joi 已停止维护</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. <code>z.coerce.number()</code> 跟 <code>parseInt(env.X)</code> 的关键差异?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> coerce 性能更好</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> parseInt 更严格</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> coerce 在转换前先校验"是不是数字",parseInt 拿到 'abc' 会变 NaN 下游莫名其妙崩</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. 为什么把 <code>validate</code> 放在 <code>ConfigModule.forRoot</code> 而不是 <code>main.ts</code> 里?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> ConfigModule 是最先初始化的 module,所有下游 module / service 依赖它,在它里面 fail-fast 能挡住所有后续初始化</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> main.ts 不支持 try/catch</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> NestJS 不允许在 main.ts 里做校验</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## 7. commit message(直接复制)

```
feat(auth-service): add Zod env validation with fail-fast (0019)

- Add apps/auth-service/src/config/env.schema.ts: Zod schema
  for 11 auth-service env vars (DATABASE_URL / REDIS_* / JWT_*
  / CAS_* / REFRESH_TOKEN_* / NODE_ENV / LOG_LEVEL / port)
- Add apps/auth-service/src/config/validate-env.ts: safeParse +
  structured error logging + throw on failure
- Integrate into ConfigModule.forRoot({ validate })
- Verified: pnpm test still 18/18 (auth-service e2e loads env
  through new validator, no test breakage)
- Verified: DATABASE_URL=not-a-url pnpm start:auth → fails at
  startup with clear "Invalid url" error (was: connects to MySQL
  and fails with cryptic ECONNREFUSED)

Trade-off: hand-rolled validate vs nestjs-zod. Chose hand-rolled
for 0019 (lesson clarity); can swap to nestjs-zod later if
boilerplate becomes painful.

Refs: docs/teaching/lessons/0019-zod-config-validation.md
```

## 8. 收口 checklist

- [ ] 4.1 grep 出 auth-service 全部 env 变量
- [ ] 4.2 写 `env.schema.ts`(11 个字段,带 Zod 校验)
- [ ] 4.3 写 `validate-env.ts`(safeParse + 友好错误)
- [ ] 4.4 改 `app.module.ts` 加 `validate: validateEnv`
- [ ] 4.5 故意改坏 env,看 fail-fast log
- [ ] 4.6 `pnpm test` 18 passed
- [ ] commit(用上面 message)
- [ ] 3 道 quiz 答完

**做完后告诉我结果,我开 0020(把 Zod 推广到剩下 4 个服务)**。
