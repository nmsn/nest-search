# 0022 · Drizzle Kit 迁移 + drizzle-zod 集成

> 副线 4(Drizzle 深度)第 1 课。nest-search 现在改 schema 是"靠手工跑 SQL",这课装上正经的迁移 + DTO 推断。

## 你今天会拿到什么

1. 理解**为什么 Drizzle Kit 是必须**(替代手工 ALTER TABLE)
2. 跑一次 `drizzle-kit generate`,产生第一个 SQL 迁移文件
3. 跑一次 `drizzle-kit push`,把 schema 应用到 dev MySQL
4. 装 `drizzle-zod`,从 schema **自动推断 DTO**(写完 schema,DTO 不用手写)
5. 18 测试还过 + 1 个 commit

## 1. nest-search Drizzle 当前现状

```
✅ drizzle-orm 0.45.2 / drizzle-kit 0.31.10 已装
✅ drizzle.config.ts 已存在(根)
✅ 5 个 schema 文件(users / cas-tickets / cas-services / business-lines / schema-factory)
❌ drizzle/migrations 目录不存在
❌ drizzle-zod 没装
❌ DTO 是手写的 class-validator(跟 schema 重复定义字段)
```

**后果**:
- 改 `users.ts` 加一个字段 → 手动 `ALTER TABLE users ADD COLUMN ...` → 跟代码可能不同步
- 新增 DTO → 手写字段列表,字段名拼错一个字母 runtime 才崩
- 没有迁移历史 → 不知道 prod DB 跟代码 schema 差多少

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
  dialect: 'mysql',
  dbCredentials: {
    url: 'mysql://root:root123@localhost:3306/nest_search',
  },
} satisfies Config;
```

**注意**:`dbCredentials.url` 是硬编码。**改成读 ConfigService 的 env** 比较干净(用 drizzle.config.ts 的运行时部分)。

### 3.3 · 加 npm scripts

改 `package.json` 加 drizzle-kit 命令:

```json
"scripts": {
  // ...existing
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

### 3.4 · 跑第一次 generate

```bash
pnpm db:generate
```

期望输出:
```
drizzle-kit: v0.31.10
drizzle-orm: v0.45.2

No schema changes, nothing to generate 😴
```

(因为现有 schema 已经反映在 DB 里 — 0022 用例是"先有 schema 后有迁移"。下次改 schema 才出文件)

**或者**:故意加一个字段 → 重新 generate → 看 `.sql` 文件生成。

### 3.5 · drizzle-zod 集成(auth-service)

新建 `apps/auth-service/src/database/dto/users.dto.ts`:

```ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../schema/users';

// 自动从 schema 推断 Zod
export const InsertUserDtoSchema = createInsertSchema(users, {
  email: z.string().email().optional(),  // 覆盖默认值
  role: z.enum(['admin', 'user']).default('user'),
});

export const SelectUserDtoSchema = createSelectSchema(users);

// TS 类型
export type InsertUserDto = z.infer<typeof InsertUserDtoSchema>;
export type SelectUserDto = z.infer<typeof SelectUserDtoSchema>;
```

**关键点**:
- `createInsertSchema(users)` 自动生成 `{ username, passwordHash, email, role, status, createdAt, updatedAt }` 全字段
- 第二个参数可以**覆盖**某个字段的规则(更严格或更宽松)
- `createSelectSchema(users)` 生成 SELECT 返回的类型(所有字段都有,因为都有 default)

### 3.6 · 在 controller 用 drizzle-zod 推断的 DTO

改 `apps/auth-service/src/user/dto/create-user.dto.ts`:

**之前**:
```ts
export class CreateUserDto {
  @IsString() @MinLength(3) username: string;
  // ...
}
```

**之后**:
```ts
// 直接 re-export drizzle-zod 推断的 schema
export { InsertUserDtoSchema as CreateUserDtoSchema } from '../../database/dto/users.dto';
export type { InsertUserDto as CreateUserDto } from '../../database/dto/users.dto';
```

### 3.7 · 全局 ValidationPipe 跑 Zod schema

NestJS 11 的 `ValidationPipe` 默认不识 Zod,需要 nestjs-zod 或手写。**0022 选手写**(避免多一个依赖):

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

改 `auth.controller.ts` 在 register endpoint 加 `@UsePipes`:

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

### 3.8 · 跑 push 到 dev DB

```bash
# 确保 docker MySQL 在跑
docker ps | grep mysql

# 把 schema 推到 dev
pnpm db:push
```

**警告**:push 会直接改 DB,生产前**先 backup**。

### 3.9 · 跑测试

```bash
pnpm test
```

期望:18 passed。如果 DTO schema 改导致 e2e 注册请求体不匹配 → 调 e2e 数据。

## 4. 设计自由度

- **是否在 drizzle.config.ts 用 ConfigService**:你定
- **DTO 用 class 还是 type**:都可以,Zod 推断的是 type,class 是装饰器
- **drizzle-zod 覆盖 auth-service 还是 form-service**:0022 只示范 auth,form 留 0023+
- **`ZodValidationPipe` 放哪**:`apps/auth-service/src/common/` 还是 `libs/shared/src/common/`:你判断

## 5. 自我检测(3 道题)

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
</div>

## 6. commit message(直接复制)

```
feat(auth-service): Drizzle Kit migrations + drizzle-zod DTO inference (0022)

- Install drizzle-zod for Zod schema inference from Drizzle tables
- Add db:generate / db:migrate / db:push / db:studio npm scripts
- Create apps/auth-service/src/database/dto/users.dto.ts:
  InsertUserDtoSchema + SelectUserDtoSchema auto-generated from users table
- Add apps/auth-service/src/common/zod-validation.pipe.ts:
  Generic ZodValidationPipe for NestJS ValidationPipe interop
- Refactor apps/auth-service/src/user/dto/create-user.dto.ts to re-export
  drizzle-zod inferred schema (eliminates duplicate field declarations)
- Verified: pnpm test 18/18 still pass
- Verified: pnpm db:push syncs schema to dev MySQL
- Lesson 0022 docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md
- LR-0026: 副线 4 第 1 课反思

Trade-off: hand-rolled ZodValidationPipe vs nestjs-zod dependency.
Chose hand-rolled for 0022 (lesson clarity + 0 new deps).

Refs: docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md
```

## 7. 收口 checklist

- [ ] 3.1 `pnpm add -wD drizzle-zod`
- [ ] 3.2 review drizzle.config.ts(可选:让 url 从 env 读)
- [ ] 3.3 加 4 个 db:* script 到 package.json
- [ ] 3.4 跑 `pnpm db:generate`(看输出)
- [ ] 3.5 写 `apps/auth-service/src/database/dto/users.dto.ts`
- [ ] 3.6 改 `create-user.dto.ts` re-export
- [ ] 3.7 写 `zod-validation.pipe.ts`
- [ ] 3.8 跑 `pnpm db:push` 到 dev MySQL
- [ ] 3.9 `pnpm test` 18 passed
- [ ] 3 道 quiz 答完
- [ ] commit(用上面 message)

**做完后告诉我结果**,我开 0023(Relations API + 事务 + 嵌套查询)。
