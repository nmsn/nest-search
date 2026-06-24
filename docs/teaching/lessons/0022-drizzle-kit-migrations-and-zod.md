# 0022 · Drizzle Kit 迁移 + drizzle-zod 集成(PostgreSQL)

> 副线 4(Drizzle 深度)第 1 课。nest-search 现在改 schema 是"靠手工跑 SQL",这课装上正经的迁移 + DTO 推断。
>
> **2026-06-24 更新**:数据库从 MySQL 迁到 PostgreSQL,driver 从 `mysql2` 换 `pg`,schema 从 `mysql-core` 换 `pg-core`。本课同步更新。

## 你今天会拿到什么

1. 理解**为什么 Drizzle Kit 是必须**(替代手工 ALTER TABLE)
2. 跑一次 `drizzle-kit generate`,产生第一个 SQL 迁移文件
3. 跑一次 `drizzle-kit push`,把 schema 应用到 dev PostgreSQL
4. 装 `drizzle-zod`,从 schema **自动推断 DTO**(写完 schema,DTO 不用手写)
5. 18 测试还过 + 1 个 commit

## 1. nest-search Drizzle 当前现状

```
✅ drizzle-orm 0.45.2 / drizzle-kit 0.31.10 / drizzle-zod 0.8.3 已装
✅ drizzle.config.ts 已存在(dialect: 'postgresql')
✅ 5 个 schema 文件(users / cas-tickets / cas-services / business-lines / schema-factory)
   全部用 pg-core(pgTable / serial / pgEnum)
✅ 3 个 drizzle.service.ts 用 node-postgres driver
✅ docker-compose 起 postgres:16-alpine(5432 端口 / pg_isready healthcheck)
❌ drizzle/migrations 目录不存在(2026-06-24 删了 MySQL 历史,等重生)
❌ DTO 是手写的 Zod(部分手写,drizzle-zod 已集成)
```

**PostgreSQL 改动要点**:
- schema import 从 `drizzle-orm/mysql-core` → `drizzle-orm/pg-core`
- `mysqlTable` → `pgTable`,`int().autoincrement()` → `serial()`
- `mysqlEnum('col', [...])` → 独立 `pgEnum('name', [...])` 常量 + `xxxEnum('col').default(...)`
- `timestamp().onUpdateNow()` → `timestamp().defaultNow().$onUpdate(() => new Date())`
- driver 从 `mysql2` → `pg`(Pool + connectionString)
- `MySql2Database<Schema>` → `NodePgDatabase<Schema>`
- `.onDuplicateKeyUpdate()` → `.onConflictDoUpdate({ target, set })`

## 2. 设计决策

### 决策 1 · `drizzle-kit generate` vs `drizzle-kit push`

| 命令 | 作用 | 何时用 |
|---|---|---|
| **`generate`** | 对比 schema 和上次生成的 SQL,产生新的迁移文件 | dev 改 schema 后 |
| **`migrate`** | 把迁移文件按序执行(管理"已应用"标记) | prod 部署 |
| **`push`** | 直接把 schema 同步到 DB(不生成文件)| dev 快速迭代 |
| **`studio`** | 启一个 GUI 看 DB | 调试 |

**0022 选**:`generate` + `push`。**dev 跑 push**(快),**migration 文件也存进 git**(给 prod 用)。

### 决策 2 · drizzle-zod 装哪一层?

drizzle-zod 的 `createInsertSchema(table)` 返回 Zod schema。装在哪?

- **每个 service 自己的 `dto/` 目录**(auth-service/dto/users.ts)— **选这个**。理由:每个 service 边界清晰,DTO 不跨服务
- 公共 `libs/shared/dto/` — 复杂 schema 重复,Drizzle 是数据层不该放 shared

### 决策 3 · 用 drizzle-zod 替换 class-validator?

**部分替换**。class-validator 的 `@IsEmail()` 等装饰器 NestJS ValidationPipe 自动跑,但 DTO 字段重复定义。

**0022 选**:auth-service 的 `CreateUserDto` 改用 drizzle-zod + `zodValidationPipe`(来自 `nestjs-zod` 风格,手写)。**class-validator 暂时保留**其他 DTO。

## 3. 动手步骤

### 3.1 · 装 drizzle-zod

```bash
pnpm add -wD drizzle-zod
```

### 3.2 · 检查 drizzle.config.ts

文件已存在(`/drizzle.config.ts`),**你 review 一下**:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: [
    './apps/auth-service/src/database/schema/**/*.ts',
    './apps/form-service/src/database/schema/**/*.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',  // ← PostgreSQL
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres123@localhost:5432/nest_search',
  },
} satisfies Config;
```

**PostgreSQL 注意**:
- `dialect: 'postgresql'`(不是 `'postgres'`)
- URL 格式 `postgresql://user:pass@host:port/db`(不是 `postgres://`,虽然 PG 两种都接受)
- 读 env 而非硬编码(避免 dev/prod 串)

### 3.3 · 加 npm scripts

`package.json` 已加:
```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

### 3.4 · 跑第一次 generate

```bash
docker-compose up -d postgres   # 先起 PG
pnpm db:generate
```

**期望输出**:
```
drizzle-kit: v0.31.10
drizzle-orm: v0.45.2

[✓] Your SQL migration file ➜ drizzle/0000_*.sql  ← 新生成(PG 语法)
```

### 3.5 · drizzle-zod 集成(auth-service)

`apps/auth-service/src/database/dto/users.dto.ts`:

```ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../schema/users';

// 自动从 pg-core schema 推断 Zod
// pgEnum 推断成 z.enum([...]),serial 推断成 z.number().int().positive()
export const InsertUserDtoSchema = createInsertSchema(users, {
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

export const SelectUserDtoSchema = createSelectSchema(users);

export type InsertUserDto = z.infer<typeof InsertUserDtoSchema>;
export type SelectUserDto = z.infer<typeof SelectUserDtoSchema>;
```

**PostgreSQL 推断要点**:
- `serial()` → `z.number().int().positive()`
- `pgEnum('user_role', ['admin', 'user'])` → `z.enum(['admin', 'user'])`
- `varchar({ length: 50 })` → `z.string().max(50)`
- `timestamp()` → `z.date()`

### 3.6 · 在 controller 用 drizzle-zod 推断的 DTO

`apps/auth-service/src/user/dto/create-user.dto.ts`:

```ts
// 直接 re-export drizzle-zod 推断的 schema
export { InsertUserDtoSchema as CreateUserDtoSchema } from '../../database/dto/users.dto';
export type { InsertUserDto as CreateUserDto } from '../../database/dto/users.dto';
```

### 3.7 · 全局 ValidationPipe 跑 Zod schema

新建 `apps/auth-service/src/common/zod-validation.pipe.ts`:

```ts
import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

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

`auth.controller.ts`:
```ts
import { UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateUserDtoSchema } from '../database/dto/users.dto';

@Post('register')
@UsePipes(new ZodValidationPipe(CreateUserDtoSchema))
async register(@Body() dto: CreateUserDto) {
  // dto 现在是 CreateUserDto 类型,已被 Zod 校验
}
```

### 3.8 · 跑 push 到 dev PostgreSQL

```bash
docker-compose up -d postgres
pnpm db:push
```

**注意**:PostgreSQL `db:push` 比 MySQL 更安全(很多 DDL 支持事务回滚)。

### 3.9 · 跑测试

```bash
pnpm test
```

期望:18+ passed。如果 DTO schema 改导致 e2e 注册请求体不匹配 → 调 e2e 数据。

## 4. MySQL → PostgreSQL 迁移速查

| MySQL | PostgreSQL | 备注 |
|---|---|---|
| `mysqlTable('x', {...})` | `pgTable('x', {...})` | 表 |
| `int('id').primaryKey().autoincrement()` | `serial('id').primaryKey()` | PK |
| `mysqlEnum('x', ['a', 'b'])` | `pgEnum('x', ['a', 'b'])` 独立常量 | enum 必须独立 |
| `varchar({ length: 50 })` | `varchar({ length: 50 })` | 相同 |
| `text` | `text` | 相同 |
| `boolean` | `boolean` | 相同 |
| `timestamp().onUpdateNow()` | `timestamp().defaultNow().$onUpdate(() => new Date())` | 应用层 onUpdate |
| `decimal(p, s)` | `numeric(p, s)` 或 `decimal(p, s)` | 都可,numeric 更 PG-native |
| `json` | `json` (同),`jsonb`(更好,推荐) | PG 可用 jsonb |
| `mysql2 / MySql2Database` | `pg / NodePgDatabase` | driver |
| `createPool({ uri })` | `new Pool({ connectionString })` | pool config |
| `.onDuplicateKeyUpdate()` | `.onConflictDoUpdate({ target, set })` | upsert |
| `insertResult[0].insertId` | `insertResult[0].id`(用 `.returning({ id })`) | 拿 id |
| `dialect: 'mysql'` | `dialect: 'postgresql'` | drizzle-kit |
| `mysql://...` | `postgresql://...` | URL |
| `docker mysql:8.0` (3306) | `docker postgres:16-alpine` (5432) | docker |

## 5. 设计自由度

- **是否在 drizzle.config.ts 用 ConfigService**:你定
- **DTO 用 class 还是 type**:都可以,Zod 推断的是 type,class 是装饰器
- **drizzle-zod 覆盖 auth-service 还是 form-service**:0022 只示范 auth,form 留 0023+
- **`ZodValidationPipe` 放哪**:`apps/auth-service/src/common/` 还是 `libs/shared/src/common/`:你判断

## 6. 自我检测(3 道题)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. drizzle-kit generate vs drizzle-kit push 的本质区别?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> 性能不同</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> generate 产生 SQL 迁移文件(给 prod migrate 用),push 直接改 DB(dev 快速迭代)</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> 完全一样</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. drizzle-zod 的 createInsertSchema(table) 自动生成什么?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> SQL 语句</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> TypeScript 类型</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> <strong>Zod schema(可运行时校验)+ 推断 TS 类型(z.infer)</strong></label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. 0022 为什么 drizzle.config.ts 的 dbCredentials.url 不直接读 ConfigService?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> drizzle-kit 是 CLI 工具,在 Node 启动 ConfigModule 之前跑,拿不到 DI 容器里的 ConfigService</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> drizzle-kit 不支持 env</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> 没必要</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="b">
    <p>4. PostgreSQL 的 pgEnum 跟 MySQL 的 mysqlEnum 区别?</p>
    <label class="quiz-opt"><input type="radio" name="q4" value="a"> 完全一样</label>
    <label class="quiz-opt"><input type="radio" name="q4" value="b"> <strong>pgEnum 必须独立定义成常量再引用,mysqlEnum 可以内联</strong></label>
    <label class="quiz-opt"><input type="radio" name="q4" value="c"> pgEnum 不支持 default</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## 7. commit message(直接复制)

```
feat(auth-service): Drizzle Kit migrations + drizzle-zod DTO inference (0022)

(PostgreSQL 适配:driver 从 mysql2 → pg,schema 从 mysql-core → pg-core)

- Install drizzle-zod for Zod schema inference from Drizzle tables
- Add db:generate / db:migrate / db:push / db:studio npm scripts
- Create apps/auth-service/src/database/dto/users.dto.ts:
  InsertUserDtoSchema + SelectUserDtoSchema auto-generated from users table
- Add apps/auth-service/src/common/zod-validation.pipe.ts:
  Generic ZodValidationPipe for NestJS ValidationPipe interop
- Refactor apps/auth-service/src/user/dto/create-user.dto.ts to re-export
  drizzle-zod inferred schema (eliminates duplicate field declarations)
- Verified: pnpm test 18/18 still pass
- Verified: pnpm db:push syncs schema to dev PostgreSQL
- Lesson 0022 docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md
- LR-0026: 副线 4 第 1 课反思

Trade-off: hand-rolled ZodValidationPipe vs nestjs-zod dependency.
Chose hand-rolled for 0022 (lesson clarity + 0 new deps).

Refs: docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md
```

## 8. 收口 checklist

- [ ] 3.1 `pnpm add -wD drizzle-zod`(已装则跳过)
- [ ] 3.2 review `drizzle.config.ts`(确认 `dialect: 'postgresql'` + PG URL)
- [ ] 3.3 确认 4 个 `db:*` script 在 package.json
- [ ] 3.4 `docker-compose up -d postgres` 起 PG
- [ ] 3.5 跑 `pnpm db:generate`(看输出)
- [ ] 3.6 写 `apps/auth-service/src/database/dto/users.dto.ts`
- [ ] 3.7 改 `create-user.dto.ts` re-export
- [ ] 3.8 写 `zod-validation.pipe.ts`
- [ ] 3.9 `pnpm db:push` 到 dev PG
- [ ] 3.10 `pnpm test` 18+ passed
- [ ] 4 道 quiz 答完
- [ ] commit(用上面 message)

---

## 打开方式

```bash
cat docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md
```

## 参考文档

- `docs/teaching/reference/drizzle-orm-reference.md`(PG 适配版,§4 有 MySQL→PG 速查表)
- PostgreSQL 官方文档:[postgresql.org/docs](https://www.postgresql.org/docs/)
- Drizzle ORM pg-core:[orm.drizzle.team/docs/column-types/pg](https://orm.drizzle.team/docs/column-types/pg)

---

**做完后告诉我结果**,我开 0023(Relations API + 事务 + 嵌套查询,PG 适配版)。
