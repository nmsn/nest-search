# 0023 · Drizzle Relations API + 事务 + 嵌套查询

> 副线 4(Drizzle 深度)第 2 课。0022 装了 Drizzle Kit + drizzle-zod,0023 把"跨表查询"和"原子写入"做对。

## 你今天会拿到什么

1. 理解 **Drizzle Relations API**(声明式 `one` / `many` 关联)
2. 亲手写 1 个 `casTickets.service.ts` 用 relations 查"用户 + 票列表"
3. 亲手写 1 个**事务**方法(createUserWithTicket 原子操作)
4. 18 测试还过 + 1 个新 e2e 测试覆盖新场景 + 1 个 commit

## 1. nest-search 当前"跨表查询"的痛点

0022 之前,如果要查"用户 + 他的 CAS ticket 列表":

```ts
// 之前:手写 join
const result = await db.select({
  user: users,
  ticket: casTickets,
})
.from(users)
.leftJoin(casTickets, eq(casTickets.userId, users.id))
.where(eq(users.id, 1));

// 转换形状
const user = { ...result[0].user, tickets: result.map(r => r.ticket) };
```

**问题**:
- join 结果是 `[{ user, ticket }, { user, ticket }, ...]` 平铺,**不是嵌套结构**
- 手动 `map` 转换容易错(尤其 ticket 为空时)
- 类型推断弱(需要手写转换逻辑)

**Relations API 解决**:**声明关联** → 直接拿到**嵌套对象**。

## 2. 设计决策(动手前先想)

### 决策 1 · declareRelations 放哪里?

```ts
// 方案 A:每个 schema 文件旁边 relations.ts
apps/auth-service/src/database/relations/users.relations.ts

// 方案 B:集中到一个 relations.ts(所有表的关联)
apps/auth-service/src/database/relations.ts
```

**选 B**。理由:
- 跨表的关联集中看,容易 review 完整性
- 不需要每个 schema 文件多写一个 relations 导出
- nest-search 关联**不多**(users ↔ casTickets),集中更简单

### 决策 2 · 事务边界谁负责?

nest-search 当前写:
```ts
// cas.controller.ts
async login(@Body() dto) {
  const user = await userService.findByUsername(dto.username);  // 查询
  await casService.createTicket(user.id, ...);                // 写入
  // ↑ 两步操作,如果第二步失败 → user 不一致(没有 ticket 但返回成功)
}
```

**问题**:**两步操作没有原子性**。如果 createTicket 失败(网络 / DB),用户会拿到 500 但**不知道** ticket 没创建。

**解决**:`db.transaction(async (tx) => { ... })` 包起来 → 任意一步失败,全部回滚。

### 决策 3 · 新建文件结构

```
apps/auth-service/src/cas/
├── cas.controller.ts
├── cas.service.ts          ← 改:加 relations 查询 + 事务方法
└── cas.module.ts
```

不新增文件,改 `cas.service.ts` 即可。

## 3. 动手步骤

### 3.1 · 创建 relations 定义

新文件 `apps/auth-service/src/database/relations.ts`:

```ts
import { relations } from 'drizzle-orm';
import { users } from './schema/users';
import { casTickets } from './schema/cas-tickets';

// 一个用户有多个 ticket(1:N)
export const usersRelations = relations(users, ({ many }) => ({
  casTickets: many(casTickets),
}));

// 一个 ticket 属于一个用户(N:1)
export const casTicketsRelations = relations(casTickets, ({ one }) => ({
  user: one(users, {
    fields: [casTickets.userId],
    references: [users.id],
  }),
}));
```

**关键 API**:
- `many(otherTable)` — 一对多
- `one(otherTable, { fields, references })` — 多对一,需指定外键字段

### 3.2 · drizzle.service.ts 注册 relations

改 `apps/auth-service/src/database/drizzle.service.ts`:

```ts
this.db = drizzle(pool, {
  schema: {
    ...schema,                    // 已有
    usersRelations,                // 新
    casTicketsRelations,           // 新
  },
  mode: 'default',
});
```

**为什么**:relations 必须注册到 schema 对象,`db.query.*` API 才能用。

### 3.3 · cas.service.ts 加 relations 查询

打开 `apps/auth-service/src/cas/cas.service.ts`,加 2 个新方法:

```ts
import { eq } from 'drizzle-orm';

@Injectable()
export class CasService {
  constructor(private readonly drizzle: DrizzleService) {}

  // 已有方法...保留

  /**
   * 用 Relations API 查用户 + 他的所有 ticket
   * 返回嵌套结构: { id, username, ..., casTickets: [{ ... }] }
   */
  async findUserWithTickets(userId: number) {
    return this.drizzle.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { casTickets: true },
    });
  }

  /**
   * 事务:创建用户 + 创建首个 ticket 原子操作
   * 如果 ticket 创建失败,user 也回滚
   */
  async createUserWithTicket(input: {
    username: string;
    password: string;
    ticket: string;
  }) {
    return this.drizzle.db.transaction(async (tx) => {
      // 1. bcrypt 密码(事务内)
      const passwordHash = await bcrypt.hash(input.password, 10);

      // 2. 创建用户
      const [userResult] = await tx.insert(users).values({
        username: input.username,
        passwordHash,
      }).$returningId();
      const userId = userResult.insertId;

      // 3. 创建 ticket
      await tx.insert(casTickets).values({
        ticket: input.ticket,
        type: 'TGT',
        userId,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),  // 8h
      });

      return { userId };
    });
  }
}
```

**关键 API**:
- `db.query.users.findFirst({ with: { casTickets: true } })` — 嵌套查询
- `db.transaction(async (tx) => {...})` — tx 代替 db,事务内所有操作
- `tx.insert(table).values(...).$returningId()` — 返回 id

### 3.4 · 写 1 个新 e2e 测试

打开 `apps/auth-service/test/auth.e2e-spec.ts`,在 `describe` 块内加 1 个测试:

```ts
it('POST /api/auth/register 用 relations 查用户 + ticket 列表', async () => {
  // 1. 注册(创建用户 + 第一个 ticket)
  const registerRes = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ username, password })
    .expect(201);

  expect(registerRes.body).toMatchObject({ username, role: 'user' });

  // 2. 用 CasService 查用户 + tickets
  const userId = registerRes.body.id;
  const userWithTickets = await casService.findUserWithTickets(userId);

  expect(userWithTickets).toMatchObject({
    id: userId,
    username,
  });
  expect(userWithTickets?.casTickets).toBeInstanceOf(Array);
  // ↑ 注册时没创建 ticket,应该是 []
});
```

**注意**:你可能要 import `CasService` 到 e2e 测试 — 看 e2e-spec 怎么 import 其他 service。

### 3.5 · 跑测试

```bash
pnpm test
```

期望:之前 18 + 你新加的 1 个 = **19 passed / 4 suites**。

### 3.6 · 验证事务(可选)

故意让 ticket 创建失败(比如 ticket 太长),验证 user 也回滚:

```ts
it('createUserWithTicket 事务回滚: ticket 失败时 user 不入库', async () => {
  // 用超长 ticket 触发错误
  await expect(
    casService.createUserWithTicket({
      username: 'failtest',
      password: 'pwd123456',
      ticket: 'x'.repeat(1000),  // 超长,触发 varchar(255) 错误
    })
  ).rejects.toThrow();

  // 验证 user 没入库
  const exists = await userService.findByUsername('failtest');
  expect(exists).toBeNull();
});
```

**这是 0023 的"反向验证"**(LR-0021 lesson §4.1 强调的)— 加进 e2e。

## 4. 设计自由度

- **relations 文件位置**:`database/relations.ts` vs 每个 schema 旁边(0023 选集中)
- **新方法命名**:`findUserWithTickets` vs `getUserWithTickets` vs `loadUserWithTickets`
- **事务方法位置**:放 `cas.service.ts` 还是 `user.service.ts`?(关联两个 entity)
- **事务粒度**:只 createUserWithTicket,还是更多原子组合?

## 5. 自我检测(3 道 quiz)— 等你写完代码再答

## 6. commit message(直接复制)

```
feat(auth-service): Drizzle relations API + transaction (0023)

- New apps/auth-service/src/database/relations.ts: declare
  usersRelations (one-to-many casTickets) and casTicketsRelations
  (many-to-one user) using drizzle-orm relations()
- drizzle.service.ts: register relations in schema object so
  db.query.* API can use them
- cas.service.ts: add findUserWithTickets (nested query via
  relations) and createUserWithTicket (db.transaction for atomic
  user+ticket creation)
- auth.e2e-spec.ts: add 1 e2e test verifying nested query
  returns expected shape
- Verified: pnpm test 19/19 pass (18 existing + 1 new)
- Verified: db.transaction rolls back user insert when ticket
  insert fails (backward-validation test added)

Trade-off: relations declared in single file (database/relations.ts)
vs per-schema relations.ts (chose single file: cross-table
relations are easier to review when co-located).

Refs: docs/teaching/lessons/0023-drizzle-relations-and-transactions.md
```

## 7. 收口 checklist

- [ ] 3.1 写 `database/relations.ts`
- [ ] 3.2 改 `drizzle.service.ts` 注册 relations
- [ ] 3.3 改 `cas.service.ts` 加 `findUserWithTickets` + `createUserWithTicket`
- [ ] 3.4 加 1 个 e2e 测试
- [ ] 3.5 `pnpm test` 19 passed
- [ ] 3.6 (可选) 加事务回滚反向验证 e2e
- [ ] 答完 3 道 quiz
- [ ] commit(用上面 message)
