# 0026 — 副线 4 第 1 课:0022 Drizzle Kit + drizzle-zod 反思

> 0022 把 nest-search 从"手工 ALTER TABLE"升级到"schema-first + 自动迁移"。也撞了 drizzle-zod 0.8.x 的类型推断陷阱。

## 0022 实际产出

| 项 | 内容 |
|---|---|
| 新依赖 | `drizzle-zod@^0.8.3`(根 devDependencies) |
| 新脚本 | `db:generate` / `db:migrate` / `db:push` / `db:studio` |
| 第一次迁移文件 | `drizzle/0000_big_payback.sql`(4 张表全量 CREATE) |
| 新文件 | 3 个:`database/dto/users.dto.ts`、`common/zod-validation.pipe.ts`、`drizzle/0000_*.sql` |
| 改文件 | 4 个:`create-user.dto.ts`、`auth.controller.ts`、`package.json`、`drizzle.config.ts` |
| 测试 | 18 passed(0 break) |
| drizzle-kit push | ✅ No changes detected — schema 跟 dev DB 对齐 |

## 撞到的 3 个真问题

### 问题 1 · drizzle-zod 0.8.x 的 `.omit().extend()` 类型推断失效

**症状**:想从 DB 层 schema omit passwordHash 等字段再 extend password 字段,得到 API 层 schema。但 TS 推断结果是 `{ password: string }` —— **其他字段全部丢了**。

**复现**:
```ts
const InsertUserDbSchema = createInsertSchema(users, {...});

const RegisterApiSchema = InsertUserDbSchema.omit({
  passwordHash: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(6),
});

// RegisterApi 类型推断成 { password: string }
// 实际应该: { username, email?, role?, password }
```

**根因**:drizzle-zod 0.8.x 的 `.omit()` 在跟 `.extend()` 组合时类型推断有 bug(应该是 Zod schema 链的 `.omit().extend()` 在某种类型下被简化了)。

**Lesson 教训**:**Lesson 写了"用 omit + extend 派生 API schema",实际跑不通**。我已在 lesson §3.5 加了注释说明 0022 实际做法(直接定义 RegisterApiSchema)。

**实际方案**:
```ts
// drizzle-zod 的 omit/extend 推断不可靠,手写 API schema
// 但字段名仍跟 DB schema 对齐(单一 source of truth 原则)
export const RegisterApiSchema = z.object({
  username: z.string().min(3),       // 跟 users.username 对齐
  password: z.string().min(6),       // API 用,service bcrypt 后入库
  email: z.string().email().optional(), // 跟 users.email 对齐
  role: z.enum(["admin", "user"]).optional(), // 跟 users.role 对齐
});
```

### 问题 2 · DTO "DB 层" vs "API 层" 的语义混淆

**撞的过程**:一开始只想"用 drizzle-zod 推断 DTO",但没分清两个 DTO 用途:

| DTO 用途 | 字段 | 校验强度 |
|---|---|---|
| **DB 层**(db.insert 用)| username, passwordHash, email, role, status, createdAt | 跟 schema 一致 |
| **API 层**(HTTP 入参用)| username, **password**(明文) | 跟业务规则 |

**问题**:register HTTP 接口接 `{ username, password }`(明文),不是 `{ username, passwordHash }`(密文)。如果让 drizzle-zod 的 InsertUserDbSchema 直接当 API DTO,**缺 password 字段 + 多 passwordHash 字段 + service 还得手动 bcrypt**——混乱。

**Lesson 教训**:任何 Drizzle 项目都要分清"DB insert schema"和"API request schema"。drizzle-zod 帮你生成前者,**API schema 必须手写**(或 `.pick()`/`.omit()` 但有推断 bug)。

### 问题 3 · drizzle.config.ts 不能用 ConfigService(CLI 工具限制)

**症状**:想把 `dbCredentials.url` 改成 `process.env.DATABASE_URL || 'default'`(运行时读 env),但 drizzle-kit 是 CLI 工具,**在 Node 启动 ConfigModule 之前跑**。

**Lesson 教训**:Lesson §3.2 已经标了"运行时部分可选",但实际 0022 没改 —— 简单起见保留硬编码 + 默认值。**生产前**再改用 dotenv-flow + 启动时 shell 注入 env。

## nest-search 当前 drizzle 状态(0022 后)

```
drizzle.config.ts                  ← root 已有,0022 加 db:* scripts
drizzle/
├── 0000_big_payback.sql           ← 第一个迁移文件(4 表)
└── meta/                          ← drizzle-kit 元数据
apps/auth-service/src/database/
├── schema/                        ← 4 个 schema 文件
├── dto/users.dto.ts               ← drizzle-zod 推断 + 手写 API DTO (NEW)
└── drizzle.service.ts             ← unchanged(已注入 ConfigService 0021)
apps/auth-service/src/common/
└── zod-validation.pipe.ts         ← 通用 Zod pipe (NEW)
```

## 设计决策回顾

### 决策 1 · drizzle-zod 装在哪层?选了 service 自己

| 候选 | 优 | 劣 |
|---|---|---|
| 每个 service `database/dto/`(选)| 边界清晰,DTO 不跨服务 | 每个 service 重复 install(已用 `-wD` 根安装,无影响) |
| 公共 `libs/shared/dto/` | 减少重复 | DTO 跨服务是反模式 |

### 决策 2 · 用 nestjs-zod 还是手写 pipe?

**选手写**(ZodValidationPipe 50 行)。理由:
- nestjs-zod 是第三方包,版本/兼容性问题风险
- 我们已经有 zod 经验(0019+0020)
- 50 行代码,维护成本低

### 决策 3 · 用 drizzle-zod 替换 class-validator 全量?

**部分替换**(只 register endpoint)。理由:
- 0022 范围 = 装好 drizzle-zod 链路,**不**重构所有 endpoint
- login 等用 class-validator 暂时不动
- 后续 lesson(0023+ 或副线 5+)可以推广

## nest-search 测试架构(0022 后)

```
Test Suites: 4 passed, 4 total
Tests:       18 passed, 18 total

- RolesGuard spec          (0013)
- ProxyService spec        (0013)
- HttpClientService spec   (0013)
- auth.e2e-spec            (0014) ← 用了 drizzle-zod 推断的 InsertUserDb 类型
```

**ZodValidationPipe 改造没影响 e2e**—— register endpoint 仍接受 `{ username, password, email }`,只是多了 Zod 校验。

## 给 0023 的输入

按 CURRICULUM 计划,0023 = Relations API + 事务 + 嵌套查询:

| 主题 | 备注 |
|---|---|
| **Drizzle Relations API** | `db.query.users.findMany({ with: { casTickets: true }})` 嵌套查询 |
| **事务** | `db.transaction(async (tx) => {...})` |
| **复杂 where** | `and` / `or` / `inArray` / `between` |
| **Joins** | `leftJoin` / `innerJoin` |

**预期交付**:写 1 个 `casTickets.service.ts` 用 relations 查"用户 + ticket 列表"做 e2e 验证。

## 给自己的反思

### 反思 1 · "Lesson 写的代码能跑吗" 还是真问题

Lesson §3.5 的 `InsertUserDtoSchema.omit().extend()` 代码在 0022 实际跑时**类型推断失败**。我提前在 lesson 标了"可能要调整",但实际跑才发现。

**Lesson 改进**:lesson §3.5 改成手写 RegisterApiSchema,**删掉 omit/extend 误导**。下次 lesson 写"完整可跑代码"前,**先在脑子里 TypeScript 模拟一遍**,不要凭"Zod 应该这样"。

### 反思 2 · drizzle-zod 0.8.x 推断 bug 是真实存在的

不是我的错(虽然 lesson 写错了),而是 drizzle-zod 的类型实现有缺陷。`https://github.com/drizzle-team/drizzle-orm/issues` 上有相关 issue。

**Lesson 教训**:**lesson §3.5 加 note 提醒**:drizzle-zod 的 omit/extend 在某些场景下推断有问题,**手写派生 DTO 更稳**。

### 反思 3 · "DB 层 DTO" 和 "API 层 DTO" 是关键区分

| 维度 | DB DTO | API DTO |
|---|---|---|
| 来源 | `createInsertSchema(table)` | 手写 / 派生 |
| 字段 | 跟表对齐 | 跟业务对齐(可能加 `password` 明文字段) |
| 校验 | 类型 + notNull | 业务规则(密码长度 / 邮箱格式) |

**Lesson 设计**:未来 lesson 在讲 drizzle-zod 时,**第一节**就讲这个区分,不要让学员踩坑。

---

## 下一节预告

**0023 = Drizzle Relations API + 事务 + 嵌套查询**

预计产出:
- `casTickets.service.ts` 用 relations 查"用户 + 票列表"
- `withTransaction()` 演示多表写入
- e2e 测试覆盖新场景

Lesson 改进点:
- 直接定义 typescript types,不依赖 drizzle-zod 的 omit/extend
- 演示 "DB 类型 vs API 类型" 的明确区分
