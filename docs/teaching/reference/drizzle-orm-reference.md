# Drizzle 全家桶速查 · nest-search 实战

> 涵盖 **drizzle-orm** + **drizzle-kit** + **drizzle-zod** 的常用 API + nest-search 实战模式。
>
> 版本:nest-search 当前装 `drizzle-orm@^0.45.2` / `drizzle-kit@^0.31.10` / `drizzle-zod@^0.8.3`。

## 导航

- §1 [drizzle-orm 核心概念](#1-drizzle-orm-核心概念)
- §2 [Schema 定义](#2-schema-定义)
- §3 [CRUD 操作](#3-crud-操作)
- §4 [Query operators(where 条件)](#4-query-operatorswhere-条件)
- §5 [Relations API + 嵌套查询](#5-relations-api--嵌套查询)
- §6 [事务](#6-事务)
- §7 [类型推断(InferSelectModel / InferInsertModel)](#7-类型推断inferselectmodel--inferinsertmodel)
- §8 [drizzle-zod 自动推断 DTO](#8-drizzle-zod-自动推断-dto)
- §9 [drizzle-kit CLI 命令](#9-drizzle-kit-cli-命令)
- §10 [nest-search 实战 checklist](#10-nest-search-实战-checklist)

---

## 1. drizzle-orm 核心概念

### 1.1 3 层抽象

```
┌─────────────────────────────────────┐
│ Schema 层(表结构定义)               │ ← mysqlTable(...)
│ e.g. users = mysqlTable('users', {...}) │
└─────────────────────────────────────┘
              ↓ 类型 + 数据
┌─────────────────────────────────────┐
│ Query 层(增删改查)                  │ ← db.select().from(users)
│ db.insert(users).values({...})      │
└─────────────────────────────────────┘
              ↓ TS 类型推断
┌─────────────────────────────────────┐
│ 应用层(用推断的类型写业务)           │ ← type User = typeof users.$inferSelect
└─────────────────────────────────────┘
```

### 1.2 MySQL Driver 初始化

```ts
// apps/*/src/database/drizzle.service.ts
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2';
import * as schema from './schema/users';

@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  async onModuleInit() {
    const pool = createPool({ uri: process.env.DATABASE_URL! });
    this.db = drizzle(pool, { schema, mode: 'default' });
  }
}
```

**关键点**:
- `mode: 'default'` — 用 mysql2 默认驱动
- `schema` — 传所有表用于 relations 推断
- `pool` — mysql2 连接池,**不**在每个 query 创建新连接

---

## 2. Schema 定义

### 2.1 mysqlTable + 列类型

```ts
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  json,
  decimal,
  mysqlEnum,
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  // 整数,主键,自增
  id: int('id').primaryKey().autoincrement(),

  // 字符串,必填,唯一,长度 50
  username: varchar('username', { length: 50 }).unique().notNull(),

  // 长字符串
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),

  // 可选字符串
  email: varchar('email', { length: 100 }),

  // 枚举
  role: mysqlEnum('role', ['admin', 'user']).default('user'),
  status: mysqlEnum('status', ['active', 'disabled']).default('active'),

  // 时间戳
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),

  // JSON 字段(带 TS 类型推断)
  metadata: json('metadata').$type<{ theme: string }>(),

  // 小数(precision 总位数, scale 小数位)
  balance: decimal('balance', { precision: 12, scale: 2 }).notNull(),
});
```

### 2.2 完整列修饰符

| 修饰符 | 作用 | 例 |
|---|---|---|
| `.primaryKey()` | 主键 | `int('id').primaryKey()` |
| `.autoincrement()` | 自增 | `int('id').autoincrement()` |
| `.notNull()` | NOT NULL | `varchar('name', { length: 100 }).notNull()` |
| `.unique()` | UNIQUE | `varchar('email', { length: 100 }).unique()` |
| `.default(value)` | 默认值 | `mysqlEnum('role', [...]).default('user')` |
| `.defaultNow()` | 当前时间 | `timestamp('created_at').defaultNow()` |
| `.onUpdateNow()` | 每次 UPDATE 更新 | `timestamp('updated_at').onUpdateNow()` |
| `.references(() => other.col)` | 外键 | `int('user_id').references(() => users.id)` |
| `.$type<T>()` | TS 类型推断 | `json('meta').$type<MyType>()` |

### 2.3 表名 vs 列名

```ts
mysqlTable('users', {        // ← 数据库表名(实际 SQL 用的)
  id: int('id'),           // ← 数据库列名
  username: varchar('username', { length: 50 }),
  //    ^^^^^^^^^^^            ← TS 字段名
});

// SQL: CREATE TABLE users (id INT, username VARCHAR(50))
// TS:  db.select().from(users)  → users.username
```

**TS 名跟 DB 名可以不一致**,但通常保持一致(可读性)。

---

## 3. CRUD 操作

### 3.1 Insert

```ts
// 单条
const [user] = await db.insert(users).values({
  username: 'alice',
  passwordHash: 'xxx',
  email: 'alice@test.com',
}).$returningId();  // 返回 id

// 多条
await db.insert(users).values([
  { username: 'bob', passwordHash: 'xxx' },
  { username: 'carol', passwordHash: 'yyy' },
]);
```

### 3.2 Select

```ts
// 查所有
const all = await db.select().from(users);

// 查条件
const [user] = await db.select().from(users).where(eq(users.id, 1));

// 部分字段
const names = await db.select({ id: users.id, name: users.username }).from(users);

// limit / offset / orderBy
const page1 = await db.select().from(users).limit(20).offset(0).orderBy(desc(users.createdAt));
```

### 3.3 Update

```ts
await db.update(users)
  .set({ status: 'disabled', updatedAt: new Date() })
  .where(eq(users.id, 1));

// set 一个字段用 SQL 表达式
await db.update(users)
  .set({ loginCount: sql`${users.loginCount} + 1` })
  .where(eq(users.id, 1));
```

### 3.4 Delete

```ts
await db.delete(users).where(eq(users.id, 1));

// 全部删除(慎用)
await db.delete(users);
```

---

## 4. Query operators(where 条件)

```ts
import { and, or, eq, ne, gt, lt, gte, lte, inArray, between, like, isNull, isNotNull, sql } from 'drizzle-orm';
```

| 操作 | API | 例 |
|---|---|---|
| 等于 | `eq(col, val)` | `where(eq(users.id, 1))` |
| 不等于 | `ne(col, val)` | `where(ne(users.status, 'disabled'))` |
| 大于 / 小于 | `gt / lt / gte / lte` | `where(gt(users.age, 18))` |
| IN 数组 | `inArray(col, [...])` | `where(inArray(users.role, ['admin', 'user']))` |
| BETWEEN | `between(col, lo, hi)` | `where(between(users.age, 18, 65))` |
| LIKE | `like(col, '%xxx%')` | `where(like(users.email, '%@test.com'))` |
| IS NULL | `isNull(col)` | `where(isNull(users.deletedAt))` |
| AND | `and(...)` | `where(and(eq(...), gt(...)))` |
| OR | `or(...)` | `where(or(eq(...), eq(...)))` |
| 自定义 SQL | `sql\`...\`` | `where(sql\`${users.name} LIKE 'a%'\`)` |

**完整示例**:

```ts
const results = await db.select().from(users).where(
  and(
    eq(users.status, 'active'),
    or(
      eq(users.role, 'admin'),
      gt(users.createdAt, new Date('2024-01-01')),
    ),
    isNull(users.deletedAt),
  ),
);
```

---

## 5. Relations API + 嵌套查询

### 5.1 定义 relations

```ts
import { relations } from 'drizzle-orm';
import { users } from './users';
import { casTickets } from './cas-tickets';

// 一个用户有多个 ticket
export const usersRelations = relations(users, ({ many }) => ({
  casTickets: many(casTickets),
}));

// 一个 ticket 属于一个用户
export const casTicketsRelations = relations(casTickets, ({ one }) => ({
  user: one(users, {
    fields: [casTickets.userId],
    references: [users.id],
  }),
}));
```

### 5.2 嵌套查询(Rels 1.0+ API)

```ts
// 查用户 + 他们的 ticket 列表
const userWithTickets = await db.query.users.findFirst({
  where: eq(users.id, 1),
  with: {
    casTickets: true,
  },
});
// 结果: { id, username, ..., casTickets: [{ id, ticket, ... }] }

// 多层嵌套
const userDeep = await db.query.users.findFirst({
  where: eq(users.id, 1),
  with: {
    casTickets: {
      with: {
        // ticket 关联的 user(自引用检查)
      },
      where: (t, { eq }) => eq(t.type, 'ST'),
    },
  },
});
```

### 5.3 手动 leftJoin(无 relations API 时)

```ts
import { eq } from 'drizzle-orm';

const result = await db
  .select({
    user: users,
    ticket: casTickets,
  })
  .from(users)
  .leftJoin(casTickets, eq(casTickets.userId, users.id))
  .where(eq(users.id, 1));
// result: [{ user: {...}, ticket: {...} }, ...] 或 ticket: null
```

---

## 6. 事务

### 6.1 基础事务

```ts
await db.transaction(async (tx) => {
  const [newUser] = await tx.insert(users).values({...}).$returningId();
  await tx.insert(casTickets).values({ userId: newUser.insertId, ... });
  // 自动 commit
  // throw → 自动 rollback
});
```

### 6.2 savepoint(嵌套事务)

```ts
await db.transaction(async (tx) => {
  await tx.insert(users).values({...});
  try {
    await tx.transaction(async (tx2) => {
      await tx2.insert(casTickets).values({...});
      throw new Error('rollback inner');
    });
  } catch (e) {
    // inner 已 rollback,outer 继续
  }
});
```

### 6.3 隔离级别

```ts
await db.transaction(
  {
    isolationLevel: 'serializable',  // 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
    accessMode: 'read write',       // 'read only' | 'read write'
  },
  async (tx) => { /* ... */ }
);
```

---

## 7. 类型推断(InferSelectModel / InferInsertModel)

### 7.1 推断 select / insert 类型

```ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// SELECT 返回的类型(所有列,有默认值也是 nullable)
export type User = InferSelectModel<typeof users>;

// INSERT 接受的类型(可省略有默认值的列)
export type NewUser = InferInsertModel<typeof users>;

// 示例
const newUser: NewUser = { username: 'alice', passwordHash: 'xxx' };
// ↑ OK,email/role/status/createdAt/updatedAt 都有默认值可省

const existingUser: User = await db.select().from(users).where(eq(users.id, 1));
// ↑ email / createdAt / updatedAt 是 string | null(可空)
```

### 7.2 联合类型(数据库 row + 关联)

```ts
// Relations API 返回的类型
type UserWithTickets = Awaited<
  ReturnType<typeof db.query.users.findFirst>
>;
// UserWithTickets = User & { casTickets: Ticket[] }
```

---

## 8. drizzle-zod 自动推断 DTO

### 8.1 基础用法

```ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../schema/users';

// DB 层 schema(包含所有 NOT NULL 字段)
export const InsertUserDbSchema = createInsertSchema(users, {
  // 覆盖默认规则
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

// SELECT 返回的 schema
export const SelectUserDtoSchema = createSelectSchema(users);

// TS 类型
export type InsertUserDb = z.infer<typeof InsertUserDbSchema>;
```

### 8.2 ⚠️ drizzle-zod 0.8.x 已知限制

| 场景 | 问题 | 解决 |
|---|---|---|
| `.omit().extend()` 组合 | TS 推断丢失字段 | 手写 schema,字段名跟 DB 对齐 |
| 嵌套 JSON 字段 | 推断成 `unknown` | 手动覆盖 `metadata: z.object({...})` |
| 自定义 enum 类型 | 推断成普通 string | 覆盖 `role: z.enum([...])` |

### 8.3 DB 层 DTO vs API 层 DTO(关键区分)

```ts
// ❌ 错误:drizzle-zod 的 InsertUserDbSchema 直接当 API DTO
// register HTTP 入参 { username, password }
// 但 InsertUserDbSchema 需要 passwordHash,不是 password

// ✅ 正确:API 层手写
export const RegisterApiSchema = z.object({
  username: z.string().min(3),       // 跟 users.username 对齐
  password: z.string().min(6),       // API 明文,service bcrypt
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
});
export type RegisterApi = z.infer<typeof RegisterApiSchema>;
```

### 8.4 跟 NestJS 集成(手写 ZodValidationPipe)

```ts
// apps/auth-service/src/common/zod-validation.pipe.ts
import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
```

```ts
// controller 用法
@Post('register')
@UsePipes(new ZodValidationPipe(RegisterApiSchema))
async register(@Body() dto: RegisterApi) { ... }
```

---

## 9. drizzle-kit CLI 命令

### 9.1 配置(drizzle.config.ts)

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: ['./apps/auth-service/src/database/schema/**/*.ts'],
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,  // 注意:drizzle-kit 是 CLI,无法用 ConfigService
  },
} satisfies Config;
```

### 9.2 命令清单

| 命令 | 作用 | 何时用 |
|---|---|---|
| `pnpm db:generate` | 对比 schema 和上次迁移,生成新 .sql 文件 | dev 改 schema 后 |
| `pnpm db:migrate` | 按序应用迁移文件,记录到 `__drizzle_migrations` 表 | prod 部署 |
| `pnpm db:push` | 直接把 schema 同步到 DB(不生成文件) | dev 快速迭代 |
| `pnpm db:studio` | 启动 GUI 看 DB(默认 4983 端口) | 调试 |
| `pnpm db:drop` | 删除所有表(**危险**) | 重置 dev DB |
| `pnpm db:pull` | 从现有 DB 反向生成 schema | 老项目迁移到 Drizzle |

### 9.3 工作流

```
1. dev 改 schema 文件(users.ts 加字段)
       ↓
2. pnpm db:generate     → 生成 drizzle/0001_xxx.sql
       ↓
3. git commit schema + migration 一起提交
       ↓
4. dev:  pnpm db:push   → schema 同步 dev DB
   prod: pnpm db:migrate → 应用迁移到 prod DB
```

### 9.4 第一次用(已有 DB,无迁移历史)

```bash
# 1. generate 生成"基线"迁移
pnpm db:generate
# 输出 drizzle/0000_initial.sql(所有 CREATE TABLE)

# 2. 标记为已应用(避免 db:migrate 重复执行)
# 法 A:用 push(简单,跳过迁移历史)
pnpm db:push

# 法 B:把迁移插入 __drizzle_migrations 表(保留迁移历史)
pnpm db:migrate
```

---

## 10. nest-search 实战 checklist

### 10.1 Schema 位置约定

```
apps/<service>/src/database/
├── schema/           ← Drizzle schema 文件
│   ├── users.ts
│   ├── cas-tickets.ts
│   └── schema-factory.ts   ← 动态生成多业务线表
├── dto/              ← drizzle-zod 推断的 Zod schema(0022)
└── drizzle.service.ts
```

### 10.2 公共 schema 是否放 libs/shared?

**不要**(0020 LR-0024 已经撞过 monorepo 跨包问题)。

**当前方案**:**inline 公共字段** + 注释提示同步。公共字段 < 10 个时足够。

### 10.3 DrizzleService 标准模式(已注入 ConfigService)

```ts
@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const uri = this.config.getOrThrow<string>('DATABASE_URL');
    const pool = createPool({ uri });
    this.db = drizzle(pool, { schema: { users, casTickets, ... } });
  }
}
```

### 10.4 drizzle-zod DTO 推荐做法

```ts
// 1. DB 层 schema(从 drizzle schema 推断)
export const InsertUserDbSchema = createInsertSchema(users, {
  email: z.string().email().optional(),
});

// 2. API 层 schema(手写,字段名跟 DB 对齐)
export const RegisterApiSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),  // 明文
  email: z.string().email().optional(),
});

// 3. controller 用 API schema + ZodValidationPipe
```

### 10.5 迁移文件 commit 规范

```bash
git add apps/auth-service/src/database/schema/users.ts
git add drizzle/0001_add_phone.sql
git commit -m "feat(db): add users.phone column + migration"
```

**schema 和 migration 一起 commit**,这样别人 clone 后 `pnpm db:migrate` 就能跟上。

---

## 🔗 相关链接

- [Drizzle ORM 官方文档](https://orm.drizzle.team/docs/overview)
- [Drizzle Kit 命令参考](https://orm.drizzle.team/docs/kit-overview)
- [Drizzle Zod](https://orm.drizzle.team/docs/zod)
- nest-search 0022 lesson:`docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md`
- nest-search LR-0026:`docs/teaching/learning-records/0026-track4-drizzle-kit-and-zod.md`

## 📋 版本与升级

| 包 | 当前版本 | 升级注意 |
|---|---|---|
| drizzle-orm | 0.45.2 | 0.46+ 改 types 导出路径 |
| drizzle-kit | 0.31.10 | 跟 orm 主版本对齐 |
| drizzle-zod | 0.8.3 | omit/extend 推断有 bug,等 0.9 |
| mysql2 | 3.x | major 升级需重测连接池 |

---

**维护说明**:这份文档每完成一个 drizzle 相关 lesson 都会更新(从实战中提炼 API 用法)。
