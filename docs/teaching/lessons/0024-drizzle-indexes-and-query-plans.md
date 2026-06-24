# 0024 · Drizzle 索引 + EXPLAIN + N+1 检测(PostgreSQL)

> 副线 4(Drizzle 深度)第 3 课。0022 装了迁移 + drizzle-zod,0023 做了 relations + 事务,0024 收尾:**性能**这一块。索引设计 + 查询计划 + N+1 检测三件套。
>
> **2026-06-24 更新**:数据库迁到 PostgreSQL 后,schema 用 `pgTable` + `serial` + `uniqueIndex`,EXPLAIN 语法同 MySQL 但输出字段略不同(用 `psql \d` 看索引、用 `EXPLAIN ANALYZE` 看真实计划)。本课同步更新。

## 你今天会拿到什么

1. 理解 **为什么索引是必须**(从 O(n) 全表扫描到 O(log n) B+tree lookup)
2. 亲手写 `uniqueIndex` / `index` 在 users.username 和 casTickets.ticket 上
3. 跑 `drizzle-kit generate` 看生成的 `.sql` 迁移文件,理解 Drizzle 怎么表达索引
4. 跑 `EXPLAIN` 看**加索引前后**的查询计划差异(type: ALL → const/ref)
5. 实测 **N+1 问题**:不用 relations 的循环 vs `db.query.users.findMany({ with })`
6. 21 测试还过 + 1 个新 e2e 测唯一约束 + 1 个 commit

## §1. nest-search 当前索引 / 性能现状

```
schema 文件:
✅ apps/auth-service/src/database/schema/{users,cas-tickets,cas-services}.ts
✅ apps/form-service/src/database/schema/{business-lines,schema-factory}.ts

现有索引:
✅ users.id  (PK,自动)
✅ casTickets.id (PK,自动)
✅ casTickets.userId (FK,PostgreSQL 自动建索引)
❌ users.username (无 → login 时 WHERE username=? 全表扫描)
❌ casTickets.ticket (无 → 查 ticket 状态 WHERE ticket=? 全表扫描)
```

**后果**:
- 注册 100 万用户 → 登录查询扫 100 万行 → 几百 ms
- 同样数据量 → 加 `uniqueIndex('idx_users_username')` → 几 ms(log n)
- casTickets.ticket 同理,查 ticket 是否过期每次都全表扫

**N+1 问题**(0023 已铺垫):用户查"我 + 我的 tickets",不用 relations 写法:
```ts
// 1 次查 users
const users = await db.select().from(users).where(eq(users.id, 1));
// N 次查 tickets(每个 user 一次)
for (const user of users) {
  user.tickets = await db.select().from(casTickets).where(eq(casTickets.userId, user.id));
}
// 总查询:1 + N 次(假设查 100 个用户 → 101 次 query)
```

用 relations 是 1 次 JOIN,无论查多少 user。

## §2. 设计决策

### 决策 1 · 加哪些索引?

| 字段 | 索引类型 | 理由 |
|---|---|---|
| `users.username` | `uniqueIndex` | 高频 WHERE 登录 + 业务唯一(注册不能重名) |
| `casTickets.ticket` | `uniqueIndex` | 高频 WHERE + 防重复登录态(同一 ticket 不能 2 个 user) |
| `casTickets.userId` | **不加** | FK 已自动建索引(PostgreSQL 自动索引外键) |
| `users.createdAt` | **不加** | 当前没有"按时间范围查"业务需求,加了反而拖写入 |

**原则**:索引**只加在 WHERE / JOIN 字段**,不加在 SELECT-only 字段。

### 决策 2 · uniqueIndex vs index

| 类型 | 作用 | 何时用 |
|---|---|---|
| `uniqueIndex` | 加速 + 强制唯一 | 业务唯一约束(users.username / casTickets.ticket) |
| `index` | 只加速 | 仅频繁查询,无唯一要求 |
| 复合索引 `index().on(t.a, t.b)` | 联合加速 | `WHERE a=? AND b=?` 高频 |

**0024 选 uniqueIndex**:业务唯一 + 查询快,两个都拿到。

### 决策 3 · N+1 怎么测?

三种方法(选 2 种演示):

1. **Drizzle 内置 logger**:`drizzle(pool, { logger: { logQuery: console.log } })` → 每次查询打印 SQL → 数查询次数
2. **PostgreSQL `log_statement = all`**:`ALTER SYSTEM SET log_statement = 'all';` → 所有 SQL 写到 `pg_log` → 数(需重启或 reload)
   - **更轻量**:`shared_preload_libraries` 装 `pg_stat_statements` → 数每条 query 执行次数
3. **代码对比**:不开 relations 的 `for` 循环 vs 开 relations 的 `findMany({ with })` → 数代码里的 query 调用

**0024 选方法 1**(Drizzle logger)+ 方法 3(代码对比)。general_log 太重。

## §3. 动手步骤

### §3.0 · 准备

确认环境:
```bash
docker ps | grep postgres   # PostgreSQL 在跑
pnpm db:push              # 当前 schema 已 push(0022 之后)
```

复习 drizzle-kit 命令:
- `pnpm db:generate` — 对比 schema 改 → 出 .sql 文件
- `pnpm db:push` — 直接同步到 dev DB
- `pnpm db:studio` — GUI 看数据

### §3.1 · schema/users.ts 加 uniqueIndex

打开 `apps/auth-service/src/database/schema/users.ts`:

**之前**(本课动手前,PostgreSQL 适配版,无索引):
```ts
import { pgTable, serial, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 64 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  role: userRoleEnum('role').default('user'),
  status: userStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});
```

**之后**:
```ts
import { pgTable, serial, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 64 }).notNull(),
    // ... 其他字段不变
  },
  (table) => ({
    usernameIdx: uniqueIndex('idx_users_username').on(table.username),
  }),
);
```

**关键 API**:
- `pgTable('table_name', { cols }, (table) => ({ ... }))` — 第 3 个参数是索引/约束回调
- `uniqueIndex('idx_name').on(table.col)` — 单列 unique index
- 索引名 `idx_users_username` 是惯例命名(表名_字段名)

### §3.2 · schema/cas-tickets.ts 加 uniqueIndex

打开 `apps/auth-service/src/database/schema/cas-tickets.ts`:

**之前**(本课动手前,PostgreSQL 适配版,无索引):
```ts
export const casTickets = pgTable('cas_tickets', {
  id: serial('id').primaryKey(),
  ticket: varchar('ticket', { length: 255 }).notNull(),
  type: varchar('type', { length: 16 }).notNull(),
  userId: integer('user_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**之后**:
```ts
import { pgTable, serial, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const casTickets = pgTable(
  'cas_tickets',
  {
    id: serial('id').primaryKey(),
    ticket: varchar('ticket', { length: 255 }).notNull(),
    // ...
  },
  (table) => ({
    ticketIdx: uniqueIndex('idx_cas_tickets_ticket').on(table.ticket),
  }),
);
```

### §3.3 · 跑 drizzle-kit generate 看 .sql 迁移文件

```bash
pnpm db:generate
```

**期望输出**:
```
drizzle-kit: v0.31.10

[✓] Your SQL migration file ➜ drizzle/0001_*.sql  ← 新文件
```

打开 `drizzle/0001_*.sql`(可能多个,挑最新),**你 review 内容**:
```sql
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);
CREATE UNIQUE INDEX `idx_cas_tickets_ticket` ON `cas_tickets` (`ticket`);
```

**理解**:
- Drizzle 把 `uniqueIndex` 转成原生 PostgreSQL `CREATE UNIQUE INDEX ... ON ...`
- 这是 prod 部署要跑的 SQL(0024 不展开 deploy 流程)
- 注意 PostgreSQL B-tree 的限制:unique index 字段如果是 text,长度有限制,但比 MySQL 宽松(没有 row size 限制)

### §3.4 · 跑 push 到 dev DB

```bash
pnpm db:push
```

确认:
```bash
# 进 PostgreSQL client(psql)
docker exec -it $(docker ps -q -f ancestor=postgres:16-alpine) psql -U postgres -d nest_search

# 查索引
\d users        # 显示 users 表的所有索引
\d cas_tickets  # 显示 cas_tickets 表的所有索引
# 或 SQL 风格:
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users';
```

**期望看到**:`indexname = idx_users_username` / `idx_cas_tickets_ticket`,`indexdef` 含 `UNIQUE`。

### §3.5 · EXPLAIN 对比

**对比 SELECT 走索引 vs 不走索引**(虽然我们已经加了 uniqueIndex,但临时 drop 看差异):

```sql
-- 1. 加索引(已有):走索引
EXPLAIN SELECT * FROM users WHERE username = 'alice';
-- PostgreSQL 输出:
--   Index Cond: (username = 'alice')   ← 命中 idx_users_username
--   ->  Index Scan using idx_users_username on users
--   rows: 1

-- 2. 假设没索引:全表扫描
EXPLAIN SELECT * FROM users WHERE email = 'a@b.com';  -- email 没加索引
--   ->  Seq Scan on users               ← 全表扫!
--   Filter: (email = 'a@b.com')
--   rows: 整张表
```

**PostgreSQL EXPLAIN 关键字段**:
- **Scan 类型**:`Index Scan` / `Index Only Scan`(走索引) vs **`Seq Scan`(全表扫)** ← 避免
- `Index Cond`: 索引条件
- `Filter`: 表层过滤
- `rows`: 估算扫描行数(越少越好)

**EXPLAIN ANALYZE**:加 `ANALYZE` 实际执行,看真实耗时:
```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE username = 'alice';
-- Execution Time: 0.05 ms   ← 走索引
```

**0024 不展开**:多列索引 / 覆盖索引 / GIN / BRIN。这些留 Phase B。

### §3.6 · N+1 实测

#### 方式 1 · 开 Drizzle logger

打开 `apps/auth-service/src/database/drizzle.service.ts`,临时加 logger:
```ts
this.db = drizzle(pool, {
  schema: { ...schema, usersRelations, casTicketsRelations },
  mode: 'default',
  logger: { logQuery: (q) => console.log('[SQL]', q) },  // ← 临时加,看完删
});
```

#### 方式 2 · 写两个对比脚本

**新建** `apps/auth-service/src/test-scripts/n-plus-one.ts`(**仅本地调试**,不进 git):

```ts
// 反面教材:不用 relations,N+1
async function nPlusOneDemo() {
  const drizzle = app.get(DrizzleService).db;
  console.log('--- N+1 模式 ---');
  const userList = await drizzle.select().from(users).limit(5);  // 1 次
  for (const u of userList) {
    await drizzle.select().from(casTickets).where(eq(casTickets.userId, u.id));  // N 次
  }
}

async function relationsDemo() {
  const drizzle = app.get(DrizzleService).db;
  console.log('--- relations 模式 ---');
  const userList = await drizzle.query.users.findMany({
    limit: 5,
    with: { casTickets: true },  // 1 次 JOIN
  });
}
```

跑(`ts-node` 或 `nest start --entryFile test-scripts`):
- N+1 模式:看到 6 次 `[SQL]` 输出(1 + 5)
- relations 模式:看到 1 次 `[SQL]` 输出(1 JOIN)

**结论**:relations 永远 1 次,不管查多少 user。

**删 logger**:测完把 `logger: ...` 删掉。

### §3.7 · 加 1 个 e2e 测唯一约束

打开 `apps/auth-service/test/auth.e2e-spec.ts`,加 1 个测试:

```ts
it('POST /api/auth/register 重复 username 应失败(唯一索引生效)', async () => {
  const uniqueUser = `dup_${Date.now()}`;
  const payload = { username: uniqueUser, password: 'pwd123456' };

  // 第一次注册:成功
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send(payload)
    .expect(201);

  // 第二次同 username:应失败(可能是 409 / 500 / 400,看 service 怎么处理 unique violation)
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send(payload);

  expect([409, 500]).toContain(res.status);
  // ↑ uniqueIndex 触发 ER_DUP_ENTRY 错误,看你 service 层 catch 后返回什么 code
});
```

**重点**:**不是测"返回 200"**,而是测"唯一约束真的生效"(返回非 2xx 即可)。

### §3.8 · 跑测试

```bash
pnpm test
```

期望:**22 passed / 5 suites**(原 21 + 0024 加 1)。

## §4. 设计自由度

- **加哪些 uniqueIndex**:除了 username / ticket,其他 service 的高频字段也可以加(form-service 的 `businessLines.code` 之类)
- **复合索引**:如果业务有 `WHERE userId=? AND expiresAt > ?`,可以加 `(userId, expiresAt)` 复合索引 — 0024 不做,留 Phase B
- **EXPLAIN 用 CLI 还是 NestJS endpoint**:都可以,CLI 更简单
- **N+1 测试**:可以用 k6 / autocannon 做压测,0024 只做代码层面对比
- **删 logger**:必须删,不然线上日志爆炸

## §5. 自我检测(3 道 quiz)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. PostgreSQL EXPLAIN 输出里 `Seq Scan` 意味着什么?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> 全表被锁定</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> <strong>全表扫描(没用到索引,O(n)),通常需要优化</strong></label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> 查询很快</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. Drizzle 的 `uniqueIndex` vs `index` 区别?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> 性能不同</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> 完全一样</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> <strong>uniqueIndex 加唯一约束 + 索引,index 只加索引不约束</strong></label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. relations 嵌套查询为什么能避免 N+1?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> <strong>1 次 JOIN 查询所有关联数据,无论查多少父记录都是 1 次 query</strong></label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> 用了缓存</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> 数据库自动优化</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## §6. commit message(直接复制)

```
feat(auth-service): Drizzle uniqueIndex + EXPLAIN verification + N+1 demo (0024)

- schema/users.ts: add uniqueIndex('idx_users_username') on
  username (fast login lookup + business uniqueness)
- schema/cas-tickets.ts: add uniqueIndex('idx_cas_tickets_ticket')
  on ticket (prevent duplicate login sessions)
- Verified: drizzle-kit generate produces 0001_*.sql with
  CREATE UNIQUE INDEX statements
- Verified: drizzle-kit push applies indexes to dev PostgreSQL
  (SHOW INDEX FROM users confirms idx_users_username)
- Verified: EXPLAIN on username=? query shows type=const
  (vs type=ALL before index)
- Verified: N+1 demo with logger shows 1+N queries (loop)
  vs 1 query (relations with: { casTickets: true })
- auth.e2e-spec.ts: add 1 test asserting duplicate username
  register fails with 409/500 (unique constraint enforced)
- Removed: temporary Drizzle logger from drizzle.service.ts
  (would explode prod logs)

Trade-off: chose uniqueIndex over plain index to enforce
business uniqueness in DB layer (defense-in-depth: app-level
check can be bypassed, DB-level can't).

Test: pnpm test 22/22 pass (21 existing + 1 new).

Refs: docs/teaching/lessons/0024-drizzle-indexes-and-query-plans.md
LR-0028: 副线 4 第 3 课反思
```

## §7. 收口 checklist

- [ ] §3.1 schema/users.ts 加 uniqueIndex
- [ ] §3.2 schema/cas-tickets.ts 加 uniqueIndex
- [ ] §3.3 `pnpm db:generate` 看 .sql 文件,review
- [ ] §3.4 `pnpm db:push` 到 dev,SHOW INDEX 确认
- [ ] §3.5 EXPLAIN 对比(type 从 ALL → const)
- [ ] §3.6 N+1 实测(2 种方式至少 1 种)
- [ ] §3.7 加 1 个 e2e 测唯一约束
- [ ] §3.8 `pnpm test` 22 passed
- [ ] 删 drizzle.service.ts 临时 logger
- [ ] 答完 3 道 quiz
- [ ] commit(用上面 message)
- [ ] 写 LR-0028

---

## 打开方式

```bash
# lesson 路径
cat docs/teaching/lessons/0024-drizzle-indexes-and-query-plans.md

# 或编辑器
code docs/teaching/lessons/0024-drizzle-indexes-and-query-plans.md
```

## 参考文档

- `docs/teaching/reference/drizzle-orm-kit-zod.md`(0022 准备,补充 §X 索引设计原则)
- LR-0027(0023 反思 — 下一节预告就是 0024)

---

**Phase A Drizzle 三连收尾**。做完 0024,Phase A 还有 0025-0030(优雅退出 / JWT 深入 / 健康检查深度),每节 2 课。
