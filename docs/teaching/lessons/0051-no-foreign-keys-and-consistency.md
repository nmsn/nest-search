# 0051 · 外键禁用 + 业务一致性(PostgreSQL)

> Phase E(企业级 DB 架构)第 1 课。nest-search schema 已无 FK(0023 LR 确认),但**应用层一致性检查**缺失 + 无软删除兜底。这节课把"业务一致性"在代码层补上。
>
> **2026-06-24 更新**:数据库迁到 PostgreSQL 后,schema 用 `pgTable` + `serial` + `uniqueIndex`,docker client 用 `psql`。

## 你今天会拿到什么

1. 理解 **5 个禁用外键的理由**(性能 / 锁 / 分库 / 微服务 / 恢复)
2. 理解 **5 种替代方案**的边界(应用层校验 / 软删除 / 定期对账 / Outbox / Saga)
3. 亲手在 `cas.service.ts` 加 `userExistsById` 校验(替代 FK 检查)
4. 给 `users` 表加 `deleted_at` 软删除字段,跑 Drizzle 迁移
5. 写 1 个 e2e 测试:**孤儿 ticket(userId 不存在)应被拒绝**
6. 22 测试还过 + 1 个 commit

## §0. 必读前置

`docs/teaching/reference/enterprise-database-architecture.md` §1-§2(企业级为什么禁用外键 + 替代方案)。

5 个理由 + 5 种替代都在参考文档里有完整推导。本课聚焦**动手**。

## §1. nest-search 当前状态盘点

```
schema/cas-tickets.ts(已确认):
  userId: int('user_id').notNull()  ← int NOT NULL,但**没有** .references(() => users.id)
                                            ↑ 这是对的:DB 层无 FK
                                            ↓ 但应用层也没校验!

schema/users.ts:
  ❌ 无 deletedAt 字段 → 硬删除会留孤儿 ticket

cas.service.ts:
  async createTicket(userId: number, ticket: string) {
    await this.db.insert(casTickets).values({ userId, ticket, ... });
    // ↑ userId 可以是任意数字(用户不存在也能插入)
    //    孤儿 ticket → 业务不一致
  }
```

**风险**:
- 黑客注册完 → 立即删 user → 留下"指向不存在 user"的 ticket
- 数据导入 / 迁移脚本可能写错 userId
- 即使代码层做对了,DB 也无法兜底(无 FK)

## §2. 设计决策

### 决策 1 · 软删除字段命名:`deleted_at` vs `is_deleted` vs `deleted`

| 命名 | 类型 | 适用 | nest-search 选 |
|---|---|---|---|
| `deleted_at` | timestamp | 记录删除时间,可审计 | ✅ |
| `is_deleted` | boolean | 仅标记,无时间 | — |
| `deleted` | boolean | 同上 | — |

**0051 选 `deleted_at`**:保留删除时间(审计 / 误删恢复都用得上);默认 `null` 表示未删。

### 决策 2 · userExists 校验放哪一层?

| 层 | 优点 | 缺点 |
|---|---|---|
| **service 层** | 业务就近,事务内 | 跨 service 调用要在事务边界 |
| **controller 层** | 早失败 | 跳过 service 层就失效 |
| **middleware / interceptor** | 通用 | 难处理"业务规则" |

**0051 选 service 层**:因为 `cas.service.ts` 直接持有 `userService`(NestJS DI),校验逻辑和业务代码在一起,事务内做最干净。

### 决策 3 · e2e 怎么造"孤儿 userId"?

**方法 A**:直接用 `999999` 这种显然不存在的 userId → 期望 4xx。
**方法 B**:先注册一个 user → 软删除 → 再用他的 id 创 ticket → 期望 4xx。

**0051 选方法 B**:更真实(模拟"用户中途被删除"的业务场景)。

## §3. 动手步骤

### §3.0 · 准备

```bash
docker ps | grep postgres   # PostgreSQL 在跑
pnpm db:push              # 当前 schema 已 push(0024 之后)
```

复习 drizzle-kit:
- `pnpm db:generate` — 改 schema 后生成 .sql
- `pnpm db:push` — dev 同步到 DB

### §3.1 · schema/users.ts 加 `deletedAt` 字段

打开 `apps/auth-service/src/database/schema/users.ts`,在字段列表末尾加:

```ts
import { pgTable, serial, varchar, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 64 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    role: varchar('role', { length: 32 }).notNull().default('user'),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
    deletedAt: timestamp('deleted_at'),  // ← 新增:null = 未删;非 null = 软删时间
  },
  (table) => ({
    usernameIdx: uniqueIndex('idx_users_username').on(table.username),
  }),
);
```

**注意**:`deletedAt` 是 nullable timestamp(默认 null = 未删)。

### §3.2 · schema/cas-tickets.ts 加注释(明确"无 FK")

打开 `apps/auth-service/src/database/schema/cas-tickets.ts`:

```ts
export const casTickets = pgTable(
  'cas_tickets',
  {
    id: serial('id').primaryKey(),
    ticket: varchar('ticket', { length: 255 }).notNull(),
    type: varchar('type', { length: 16 }).notNull(),
    // ⚠️ 故意不加 .references(() => users.id)
    // 理由:企业级应用禁用外键(性能 + 锁 + 分库 + 微服务兼容性)
    // 应用层一致性检查在 CasService.createTicket 里:
    //   const exists = await userService.existsById(userId);
    //   if (!exists) throw new NotFoundException(`User ${userId} not found`);
    // 详见:docs/teaching/reference/enterprise-database-architecture.md §1
    userId: int('user_id').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    ticketIdx: uniqueIndex('idx_cas_tickets_ticket').on(table.ticket),
  }),
);
```

**关键**:**注释是 contract**。下次有人想加 FK,会看到这段说明,问"为什么要去掉"。

### §3.3 · user.service.ts 加 `existsById` 方法

打开 `apps/auth-service/src/user/user.service.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm';

@Injectable()
export class UserService {
  // ... 已有方法保留

  /**
   * 检查 user 是否存在且未删除(替代 FK 约束)
   * 不存在 / 已软删 → 返回 false
   */
  async existsById(id: number): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return !!row;
  }
}
```

**关键**:
- 同时检查 `id 存在` + `deletedAt 为 null`(软删不算存在)
- `select({ id })` 只查 id,省 IO
- `.limit(1)` 防止 `IN` 场景下多查

### §3.4 · cas.service.ts 加校验

打开 `apps/auth-service/src/cas/cas.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../user/user.service';

@Injectable()
export class CasService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly userService: UserService,  // ← 新增注入
  ) {}

  // ... 已有方法保留

  async createTicket(userId: number, ticket: string, type: 'TGT' | 'ST' = 'TGT') {
    // ⚠️ 替代 FK 约束:应用层检查 user 存在
    const exists = await this.userService.existsById(userId);
    if (!exists) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    await this.drizzle.db.insert(casTickets).values({
      userId,
      ticket,
      type,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
  }
}
```

**关键**:
- `NotFoundException`(404)而不是 400 — 用户不存在是"资源找不到"语义
- 校验在 service 层,事务边界由调用方决定(createUserWithTicket 在 0023 的事务里)
- NestJS DI 自动注入 `UserService`,零配置

### §3.5 · 跑 drizzle-kit generate 看 .sql

```bash
pnpm db:generate
```

**期望输出**:
```
drizzle-kit: v0.31.10

[✓] Your SQL migration file ➜ drizzle/0002_*.sql  ← 新文件
```

打开 `drizzle/0002_*.sql`,review:
```sql
ALTER TABLE `users` ADD `deleted_at` timestamp;
```
或(取决于 Drizzle 版本):
```sql
ALTER TABLE `users` ADD COLUMN `deleted_at` TIMESTAMP NULL;
```

### §3.6 · 跑 push 到 dev

```bash
pnpm db:push
```

验证:
```bash
docker exec -it $(docker ps -q -f ancestor=postgres:16-alpine) psql -U postgres -d nest_search -c "\d users"
```

**期望看到**:`deleted_at | timestamp | YES | | NULL |`

### §3.7 · 加 1 个 e2e 测试

打开 `apps/auth-service/test/cas.e2e-spec.ts`(如果没有就建),加 1 个测试:

```ts
import { NotFoundException } from '@nestjs/common';

describe('CAS e2e:孤儿 ticket 防护', () => {
  it('POST /api/cas/tickets 用已软删的 userId 应 404', async () => {
    // 1. 注册一个 user
    const regRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username: `todelete_${Date.now()}`, password: 'pwd123456' })
      .expect(201);
    const userId = regRes.body.id;

    // 2. 软删 user
    await request(app.getHttpServer())
      .delete(`/api/users/${userId}`)  // 假设有 DELETE endpoint(可能还没)
      .expect(200)
      .expect((res) => {
        // 期望返回 updated/deleted 字段
      });
    // ↑ 如果没 DELETE endpoint:直接调 UserService.softDelete(userId)

    // 3. 用这个 userId 创 ticket → 应 404
    await request(app.getHttpServer())
      .post('/api/cas/tickets')
      .send({ userId, ticket: 'orphan-test', type: 'ST' })
      .expect(404)
      .expect((res) => {
        expect(res.body.message).toContain('User');
      });
  });
});
```

**注意**:
- 0051 不要求新增 DELETE /users endpoint。可以**直接在测试里调 `userService.softDelete(userId)`**(拿 service 引用)
- 或者**纯 service 层测试**(单元测试,不通过 HTTP)— 也行,更简单
- 0051 选**单元测试**(避开 endpoint 设计的扩展):

```ts
// apps/auth-service/src/cas/cas.service.spec.ts(新建)
describe('CasService.createTicket', () => {
  it('软删 user 的 ticket 应抛 NotFoundException', async () => {
    const mockUserService = {
      existsById: jest.fn().mockResolvedValue(false),  // 模拟 user 不存在 / 已软删
    };
    const casService = new CasService(mockDrizzle, mockUserService);

    await expect(
      casService.createTicket(999, 'orphan-ticket', 'ST'),
    ).rejects.toThrow(NotFoundException);

    expect(mockDrizzle.db.insert).not.toHaveBeenCalled();  // 关键:没 insert
  });
});
```

**两种路径选一个**(0051 选 mock service 单元测试,简单)。

### §3.8 · 跑测试

```bash
pnpm test
```

**期望**:**22 passed / 5 suites**(原 21 + 0051 加 1)。

## §4. 设计自由度

- **软删除字段类型**:`timestamp nullable` vs `boolean isDeleted` + 单独 `deleted_at`(可读性更好)
- **校验放 service vs interceptor**:`CasTicketExistsGuard`(NestJS Guard)也行,但 service 层更通用
- **是否同时检查 `status='active'`**:`UserService.existsById` 可以多加 `eq(users.status, 'active')`(看业务)
- **孤儿 ticket 检测**:0051 只测"创建时防护";运行时的"用户被删后已存在的 ticket 怎么办" → 留 0052+ 深入
- **定期对账 cron**:0051 不做,留 0055(Outbox 模式一起讲)

## §5. 自我检测(3 道 quiz)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. 企业级应用禁用外键的最关键理由?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> 外键语法太复杂</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> <strong>分库分表时无法跨 DB 验证约束,微服务时无法跨 service 验证</strong></label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> 外键性能一定差</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. 应用层校验 + 软删除是哪种一致性保障?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> 强一致(同事务)</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> 最终一致(异步对账)</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> <strong>准强一致(同步校验,异步兜底)— 单 service 内强,跨 service 最终</strong></label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. nest-search 0051 为什么选 `deleted_at` 而不是 `is_deleted`?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> <strong>保留删除时间戳,审计 / 误删恢复 / 数据分析都用得到</strong></label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> timestamp 性能更好</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> 没区别,随便选</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## §6. commit message(直接复制)

```
feat(auth-service): 应用层 user 存在性校验 + users.deletedAt 软删除 (0051)

Phase E(企业级 DB 架构)第 1 课:外键禁用 + 业务一致性。

- apps/auth-service/src/database/schema/users.ts: 加 deletedAt
  timestamp nullable 字段(null = 未删,非 null = 软删时间)
- apps/auth-service/src/database/schema/cas-tickets.ts: userId 字段
  加注释,明确"故意不加 .references() — 企业级禁用 FK 共识"
  (详见 reference/enterprise-database-architecture.md §1)
- apps/auth-service/src/user/user.service.ts: 新增 existsById(id)
  方法 — 同时检查 id 存在 + deletedAt 为 null(软删不算存在)
- apps/auth-service/src/cas/cas.service.ts: createTicket 调用
  userService.existsById(userId) 替代 FK 约束,user 不存在抛
  NotFoundException(404)
- drizzle/0002_*.sql: Drizzle Kit 自动生成的 ALTER TABLE
- apps/auth-service/src/cas/cas.service.spec.ts: 新增单元测试
  验证 mock existsById=false 时 createTicket 不调 insert

Trade-off: 应用层校验 vs DB FK 约束 — 0051 选应用层,因为
分库分表时跨 DB FK 不可能,应用层校验是唯一通用方案。

Test: pnpm test 22/22 pass (21 existing + 1 new).

Refs:
- docs/teaching/lessons/0051-no-foreign-keys-and-consistency.md
- docs/teaching/reference/enterprise-database-architecture.md
LR-0051: Phase E 第 1 课反思(待写)
```

## §7. 收口 checklist

- [ ] §3.1 schema/users.ts 加 deletedAt
- [ ] §3.2 schema/cas-tickets.ts userId 加"无 FK"注释
- [ ] §3.3 user.service.ts 加 existsById
- [ ] §3.4 cas.service.ts createTicket 加 existsById 校验
- [ ] §3.5 `pnpm db:generate` 看 .sql
- [ ] §3.6 `pnpm db:push` + DESCRIBE users 验证
- [ ] §3.7 加 1 个单元测试(mock existsById=false)
- [ ] §3.8 `pnpm test` 22 passed
- [ ] 答完 3 道 quiz
- [ ] commit(用上面 message)
- [ ] 写 LR-0051(选 1-2 个真撞的点深入)

---

## 打开方式

```bash
cat docs/teaching/lessons/0051-no-foreign-keys-and-consistency.md
# 或
code docs/teaching/lessons/0051-no-foreign-keys-and-consistency.md
```

## 配套参考

- `docs/teaching/reference/enterprise-database-architecture.md` §1-§2(5 理由 + 5 替代)
- LR-0027(0023 反思 — 提了"非事务性副作用"问题,0051 解决一半,0055 Outbox 解决另一半)

---

**Phase E 开篇**。做完 0051,后续 0052-0056 是:**高并发 / 缓存 / 分库分表 / Outbox / 微服务 DB per Service**,每节 1 小时左右。0052 0053 优先(性能 + 缓存是 nest-search 当前最缺的两块)。
