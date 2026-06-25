# 0020 · Zod 推广 + 抽公共 schema

> 副线 3(配置校验)第 2 课。0019 给 auth-service 装上 Zod,0020 把模式推广到剩下 4 个服务 + 抽公共 schema 避免重复。

## 导航

- **上一课** · [0019 Zod 配置校验:让服务在启动时 fail-fast](./0019-zod-config-validation.md)
- **当前课** · 0020(本文件)— 5 service 都装 Zod,撞了 monorepo 跨包问题回退 inline
- **下一课** · [0021 env.example + 配置文档化](./0021-env-example-and-config-docs.md)
- **相关 LR** · [LR-0024 副线 3 monorepo 跨包踩坑反思](../learning-records/0024-track3-zod-monorepo-friction.md) · [LR-0023 副线 3 第 1 课反思](../learning-records/0023-track3-zod-validation.md)
- **相关参考** · [CURRICULUM.md 总体设计](../CURRICULUM.md) · [MISSION.md 项目使命](../MISSION.md)
- **本课产物**:
  - 5 个 service × 2 文件(env.schema + validate-env)共 10 个新文件
  - 5 个 service `app.module.ts` 改
  - 最终决定:inline 公共字段(不抽 libs/shared)

## 你今天会拿到什么

1. 把 **5 个公共 env 字段**抽到 `libs/shared/config/base-env.ts`
2. 给 **gateway / search / sync / form** 4 个服务各自装 Zod schema(extend 公共 base)
3. 18 测试还过 + 4 个 service 都能 fail-fast
4. 1 个 commit

## 1. 0019 复习 + 0020 范围

0019 给 `auth-service` 装上 Zod 校验。0019 的 `AuthEnvSchema` 有 11 个字段,其中 **5 个是所有 5 个服务都有的公共字段**(NODE_ENV / LOG_LEVEL / JWT_SECRET / JWT_EXPIRES_IN / CAS_*)。

**0020 的核心动作**:
- 抽公共 5 字段到 `libs/shared/config/base-env.ts`
- 每个 service 的 schema 用 `.extend(BaseEnvSchema.shape)` 复用
- 4 个 service 各自 `ConfigModule.forRoot({ validate })`

## 2. 设计决策

### 决策 1 · 抽 base-env vs 每个 service 复制粘贴

| 方案 | 优 | 劣 |
|---|---|---|
| **抽 base-env** | 公共字段改 1 处全改 | 多 1 个 import |
| 复制粘贴 | 简单 | 改 JWT_SECRET 校验规则要改 5 次 |

**选抽 base-env**。公共字段的校验规则(如 JWT_SECRET ≥16)改 1 次 5 个服务全生效。

### 决策 2 · `extend` vs `.merge`

Zod 提供两种组合 schema 的方式:
- `SchemaA.extend(SchemaB.shape)` — SchemaB 的字段追加,字段冲突**后者覆盖前者**
- `SchemaA.merge(SchemaB)` — 类似,但 type 推断更友好

**选 `.extend`**。NestJS 项目主流用法,文档多。

### 决策 3 · libs/shared/config/ vs apps/shared/config/

nest-search 已经有 `libs/shared/`(用 drizzle-zod / schemas 等)。**新加 `libs/shared/config/` 子目录**。理由:
- 项目已有 `libs/shared/`,新建 `apps/shared/` 反而分裂
- 公共 schema 本质是"代码共享",放在 libs 是惯例
- import 路径短:`from '@app/shared/config/base-env'` 或类似

### 决策 4 · 是否用 ConfigService 替代 process.env

0019 LR 提到的"小问题":`AUTH_SERVICE_PORT` 校验了但 `main.ts` 没消费。

**0020 范围内**:不展开 ConfigService 改造。**只装 Zod 校验 + ConfigModule 集成**。ConfigService 全面改造留给后续 lesson(2025 那次预留)。

**为什么**:ConfigService 改造会动所有 main.ts + 所有 service 构造器注入,**scope creep**。0019-0021 这 3 节只解决"配置校验"一件事。

## 3. libs/shared/config 目录设计

```
libs/shared/config/
└── base-env.ts     # 公共 5 字段 schema
```

**预期文件内容**(只给接口骨架,不写完整代码):

```ts
// libs/shared/config/base-env.ts
import { z } from "zod";

export const BaseEnvSchema = z.object({
  // 你写这 5 个公共字段
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;
```

**5 个公共字段**(你决定每条的校验规则):

| 字段 | 类型建议 | 备注 |
|---|---|---|
| `NODE_ENV` | `z.enum(['development', 'test', 'production'])` | 3 选 1,默认 'development' |
| `LOG_LEVEL` | `z.enum(['error', 'warn', 'info', 'debug'])` | 4 选 1,默认 'info' |
| `JWT_SECRET` | `z.string().min(16)` | 必须 ≥16 字符(安全考量) |
| `JWT_EXPIRES_IN` | `z.string().default('2h')` | 自由字符串,语义层处理 |
| `CAS_COOKIE_DOMAIN` | `z.string().default('.example.local')` | 默认值 |
| `CAS_TGT_EXPIRES_IN` | `z.string().default('8h')` | |
| `CAS_ST_EXPIRES_IN` | `z.string().default('30s')` | |

> **注意**:gateway 实际也有 CAS_*,但 CAS 在 nest-search 是 auth-service 的领域概念,gateway 只是代理 — **要不要把 CAS_* 放 base-env 你判断**。如果只 auth-service 用,CAS_* 应该从 base-env 移到 auth-service 自己的 schema(0019 已经覆盖)。

**决策留给你**:
- **A**: 全部 7 字段放 base-env(简单,所有 service 都有)
- **B**: 只放 4 字段(NODE_ENV / LOG_LEVEL / JWT_*),CAS_* 留给 auth-service 自己(更严格)

我倾向 B,但你选。

## 4. 各 service 字段清单

按 0019 lesson §4.1 你 grep 的结果(我帮你统计好了):

### gateway(15 字段,实际 5 公共 + 10 私有)

**私有**:
- `API_KEY_DS`, `API_KEY_ZK`, `API_KEY_MEETING` — 3 个 business line API key
- `AUTH_SERVICE_URL`, `SEARCH_SERVICE_URL`, `SYNC_SERVICE_URL`, `FORM_SERVICE_URL` — 4 个下游 URL
- `GATEWAY_PORT` — port
- `REDIS_URL` — MQ 连接

### search-service(9 字段,公共 + 3 私有)

**私有**:
- `ELASTICSEARCH_NODE` — ES URL
- `SEARCH_SERVICE_PORT`
- `REDIS_URL`

### sync-service(10 字段,公共 + 4 私有)

**私有**:
- `DATABASE_URL` — PostgreSQL 连接
- `ELASTICSEARCH_NODE`
- `SYNC_SERVICE_PORT`
- `REDIS_URL`

### form-service(9 字段,公共 + 3 私有)

**私有**:
- `DATABASE_URL`
- `FORM_SERVICE_PORT`
- `REDIS_URL`

### auth-service(11 字段,0019 已装)

不再改。但**建议把 0019 的 AuthEnvSchema 也改成 `.extend(BaseEnvSchema.shape)`** — 跟新模式对齐。

## 5. zod 4.x 关键 API(版本说明)

0019 lesson 没标 zod 版本,user 装的是 **zod@^4.4.3**。以下是 4.x 的关键 API(如果你装的是其他版本,语法可能略有差异,**以 https://zod.dev/v4 为准**):

| 用法 | 4.x 语法 |
|---|---|
| 字符串 | `z.string()` |
| 数字 | `z.number()` |
| URL | `z.string().url()` |
| 转字符串 → 数字 | `z.coerce.number()` |
| 限定值 | `z.enum(['a', 'b'])` |
| 最小长度 | `z.string().min(16)` |
| 默认值 | `.default('localhost')` |
| 合并 schema | `BaseSchema.extend(OtherSchema.shape)` |
| 校验不抛 | `schema.safeParse(data)` → `{ success, data, error }` |
| 校验抛 | `schema.parse(data)` → throws ZodError |
| 推 TS 类型 | `type T = z.infer<typeof Schema>` |

## 6. 动手步骤(你做)

### 6.1 · 创建公共 schema

新文件 `libs/shared/config/base-env.ts`。**只写公共字段**(NODE_ENV / LOG_LEVEL / JWT_* / 可选 CAS_*)。

### 6.2 · 确认 libs/shared 可以被 4 个 service import

看 `nest-cli.json` 或 `tsconfig.paths`,确保 `libs/shared` 是 monorepo 的 path alias。

```bash
# 试一下能不能 import
grep -E "libs/shared|@app/shared" nest-cli.json tsconfig.json 2>&1 | head -5
```

如果没配置,你需要:
- `nest-cli.json` 加 `"compilerOptions": { "paths": { "@app/shared/*": ["libs/shared/*"] } }`
- 或者每个 service 用相对路径 `../../../libs/shared/config/base-env`

**这是 lesson 范围外的"配置 monorepo alias"问题,自己判断怎么处理**。

### 6.3 · 4 个 service 各自加 schema

每个 service 一个新文件 `apps/<service>/src/config/env.schema.ts`:

```ts
// 伪代码示意,你自己写完整版
import { z } from "zod";
import { BaseEnvSchema } from "@app/shared/config/base-env";

export const GatewayEnvSchema = BaseEnvSchema.extend({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  AUTH_SERVICE_URL: z.string().url(),
  // ... 其他私有字段
});
```

重复 4 次,每个 service 一个文件。

### 6.4 · 4 个 service 各自加 validate-env.ts

跟 0019 完全一样的模式,只是 import 各自的 `XxxEnvSchema`。

### 6.5 · 4 个 service 改 app.module.ts

每个 service 在 `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`。

### 6.6 · 把 0019 auth-service 改成 extend BaseEnvSchema

让 5 个 service 风格统一。

### 6.7 · 跑测试

```bash
pnpm test
```

期望:`Test Suites: 4 passed / Tests: 18 passed`。

### 6.8 · 4 个 service 各自 fail-fast 实测

每个 service 跑一次 fail-fast,确认能定位错误:

```bash
DATABASE_URL="not-a-url" pnpm start:search    # search 报 DATABASE_URL 错
PORT_NOT_NUMBER="abc" pnpm start:gateway      # gateway 报 port 错
```

**清理命令(必带 lsof 兜底)**:

```bash
# 标准清理模式
kill $PID 2>/dev/null
sleep 1
lsof -ti :3000 -i :3001 -i :3002 -i :3003 -P | xargs kill -9 2>/dev/null
```

## 7. 设计自由度

- **base-env 包含哪些字段**(A vs B 决策):你定
- **每个私有字段的校验严格度**:端口范围 / URL 协议 / 必填 vs 默认
- **monorepo alias 配置方式**(paths vs 相对路径)
- **每个 schema 的 type 导出命名**:GatewayEnv / GatewayEnvSchema 等

## 8. 自我检测(3 道题)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. 为什么抽 base-env 而不是每个 service 复制 JWT_SECRET 校验?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> 性能</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> 公共字段(如 JWT_SECRET ≥16 校验)改 1 处,5 个 service 全生效,避免 5 处不一致</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> 复制粘贴太慢</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. <code>BaseSchema.extend(OtherSchema.shape)</code> 中,字段冲突时哪个生效?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> BaseSchema 优先</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> 报错</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> OtherSchema 优先(extend 的参数覆盖 base)</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. 0020 为什么不动 ConfigService 全面替代 process.env?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> scope creep — 改 ConfigService 会动所有 main.ts + service 构造器注入,超出 0019-0021 配置校验范围</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> ConfigService 不支持 Zod</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> 没必要,process.env 够用</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## 9. commit message(直接复制)

```
feat(services): promote Zod validation to all 5 services + shared schema (0020)

- Add libs/shared/config/base-env.ts: BaseEnvSchema with shared
  fields (NODE_ENV / LOG_LEVEL / JWT_SECRET / JWT_EXPIRES_IN)
- gateway / search-service / sync-service / form-service:
  - New apps/<service>/src/config/env.schema.ts: extends
    BaseEnvSchema with service-specific fields (PORT / *URL /
    API_KEY / REDIS_URL / etc.)
  - New apps/<service>/src/config/validate-env.ts: safeParse +
    structured error logging + throw
  - app.module.ts: ConfigModule.forRoot({ validate })
- auth-service: refactor AuthEnvSchema to extend BaseEnvSchema
  for consistency (no behavior change)
- Verified: pnpm test still 18/18
- Verified: 4 services fail-fast on bad env (e.g.
  DATABASE_URL=not-a-url pnpm start:search → fails with
  "Invalid URL")
- Lesson 0020 docs/teaching/lessons/0020-zod-promote-shared-schema.md
- LR-0024: 0020 review + scope discipline reflection

Trade-off: scope limited to config validation. ConfigService
vs process.env global migration deferred to a separate lesson
to avoid scope creep.

Refs: docs/teaching/lessons/0020-zod-promote-shared-schema.md
```

## 10. 收口 checklist

- [ ] 6.1 写 `libs/shared/config/base-env.ts`(公共字段 + 类型)
- [ ] 6.2 确认 monorepo alias 可用(或用相对路径)
- [ ] 6.3 4 个 service 各自写 env.schema.ts(extend base)
- [ ] 6.4 4 个 service 各自写 validate-env.ts
- [ ] 6.5 4 个 service 改 app.module.ts
- [ ] 6.6 auth-service AuthEnvSchema 改 extend BaseEnvSchema
- [ ] 6.7 `pnpm test` 18 passed
- [ ] 6.8 4 个 service fail-fast 实测 + lsof 兜底清理
- [ ] 3 道 quiz 答完
- [ ] commit(用上面 message)

**做完后告诉我结果,我开 0021(env.example + ConfigService 改造 + 总验证)**。
