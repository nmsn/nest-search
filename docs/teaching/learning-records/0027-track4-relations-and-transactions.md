# 0027 — 副线 4 第 2 课:0023 Relations + 事务 反思

> 0023 是"读 + 写代码 + 3 道 quiz"完整流程(模式 B)。这次没漂。

## 0023 实际产出

| 项 | 内容 |
|---|---|
| 用户模式 | **B · 读 + 写代码**(不是 A 路径)|
| 写代码 | 1 个新 service 方法 + 1 个事务方法 + 1 个新 e2e 文件 |
| 撞的 TS 错 | 3 个(drizzle.service 类型推断 / bcrypt 没 import / $returningId 结构)|
| 顺带暴露 | DrizzleService `ReturnType<typeof drizzle>` 推成 `Record<string, never>` bug |
| 顺带实现 | **方案 D TypeScript Project References**(修 IDE 类型错误)|
| 测试 | 21 passed / 5 suites(原 18 + 0023 加 3)|
| Quiz | 3 道(哲学 / 业务 / 风险)|
| Quiz 表现 | 3/3 ✅(深度补到位)|

## 🎯 0023 quiz 回顾

### Q1 · drizzle 设计哲学(答:提前声明 + 性能 + 可预测)

**考点**:为什么 drizzle relations 是"声明 + 显式 with"而非"自动 eager load"?

**你的答案**:"提前声明 + 性能更好 + 可预测" — ✅ 方向全对

**我补的**:**N+1 经典问题**
- 自动 eager load(Prisma 风格)= 用户 1 → 查 tickets;用户 2 → 查 tickets;... → 1 + N 次查询
- 显式 `with: {...}` = 永远 1 次 JOIN 查询,不管查多少 user
- **手动声明 = 开发者掌控 N+1**

### Q2 · 嵌套查询 null 处理(答:业务类型不同,不能只返回 notFound)

**考点**:`findUserWithTickets(userId)` 返回 null 应该报什么错?

**你的答案**:方向对 — 业务类型不同,需要根据场景区分

**我给的例子**:
- admin 查其他用户 → URL 参数 → null = 404 Not Found
- 用户查自己 / API 调用 → JWT sub → null = 401 Unauthorized
- 关联查询反查 → 内部 FK → null = 500 Server Error

**核心**:**service 返回 type 而不是 throw**,controller 决定 status code。这跟你说的"业务类型不同"完全对应。

### Q3 · 跨系统副作用(答:不可预测 + 有副作用 + 脏数据)

**考点**:db.transaction 中调 Redis,事务回滚后 Redis 残留会怎样?

**你的答案**:"不可预测 + 有副作用 + 脏数据" — ✅ 全对,只是没具体技术术语

**我补的**:**"非事务性副作用"** + 3 个补救方案:
1. **Outbox 模式**(推荐):DB 事务里插 outbox 表,worker 读 outbox 写 Redis
2. **副作用放事务外**:commit 成功后再写 Redis
3. **Saga 模式**(复杂,多服务协调)

**nest-search 0023 lesson §3.6 的事务回滚测试**:只测 DB 一致性(用户插入和 ticket 插入原子)。**Redis 残留是 0024+ 才深入讲**。

## 🐛 0023 撞的 3 个真错误

### 错误 1 · DrizzleService.db 类型推断为 `{}`

```ts
public db!: ReturnType<typeof drizzle>;  // 推成 Record<string, never>
```

**根因**:drizzle 函数泛型默认 `TSchema extends Record<string, unknown> = Record<string, never>`,因为 TS 在 class 定义阶段不知道 runtime 会传什么 schema。

**修复**:显式定义 Schema 类型 + 用 `MySql2Database<Schema>`:

```ts
type Schema = {
  users: typeof users;
  casTickets: typeof casTickets;
  casServices: typeof casServices;
  usersRelations: typeof usersRelations;
  casTicketsRelations: typeof casTicketsRelations;
};

public db!: MySql2Database<Schema>;
```

**Lesson 设计教训**:`ReturnType<typeof drizzle>` 模式有隐藏陷阱。Lesson §3 应该写**显式类型**而不是 ReturnType。

### 错误 2 · bcrypt 没 import

```ts
await bcrypt.hash(input.password, 10);  // bcrypt is not defined
```

**修复**:文件顶部加 `import * as bcrypt from 'bcrypt';`

### 错误 3 · `$returningId()` 返回结构错

```ts
const [userResult] = await tx.insert(users).values({...}).$returningId();
const userId = userResult.insertId;  // ← 错,mysql2 返回 { id: number } 不是 { insertId }
```

**修复**:用 `userResult.id`

## 🛠 顺带实施方案 D 的成果

**意外收益**:方案 D 不只是为了 IDE 类型,还**解决了 0023 的 TS 错**:

1. **错误 1**(drizzle 类型):方案 D 让我必须显式 Schema 类型,间接修了这个 bug
2. **错误 2/3**(import / 返回结构):跟方案 D 无关,是单纯写代码错

**方案 D 改的文件**:
- root `tsconfig.json` → solution config(`files: []` + `references`)
- root `tsconfig.app.json`(新建)→ 抽公共 app 配置
- root `tsconfig.spec.json` → 自包含(composite + jest types)
- 5 个 `apps/*/tsconfig.app.json` → 简化 extends root
- `.vscode/settings.json`(新建)→ IDE 用 root tsconfig

## 🧪 测试结果

```
Test Suites: 5 passed, 5 total
Tests:       21 passed, 21 total
```

新增 3 个:
- `auth.e2e-spec.ts` 加 §3.4 relations 测试(用 uniqueUser 避免 409)
- `cas.e2e-spec.ts`(新建)加 §3.4 relations + §3.6 事务回滚

## 📊 nest-search 当前 Drizzle 状态

```
schema files:
✅ apps/auth-service/src/database/schema/{users,cas-tickets,cas-services}.ts
✅ apps/form-service/src/database/schema/{business-lines,schema-factory}.ts

relations 文件(0023 新):
✅ apps/auth-service/src/database/relations.ts (users ↔ casTickets)

drizzle service:
✅ 已注入 ConfigService(0021)
✅ 显式 Schema 类型(本次修)

DTO:
✅ drizzle-zod 推断(0022)
✅ LoginApi + RegisterApi 切换到 Zod(0023 期间)
✅ 方案 B:user/dto/create-user.dto.ts 删,DTO 统一在 database/dto/

tests:
✅ 单元:3 个 spec(0013 + 0021 + 0023)
✅ e2e:auth + cas(本次加)
✅ 21 passed
```

## 🎯 0023 给后续 lesson 的输入

按 CURRICULUM:
> 0024 = 性能(N+1 / 索引 / 查询计划)

**0024 应该覆盖**:
- drizzle explain plan
- 索引设计与 EXPLAIN
- N+1 检测工具
- Query 优化实战

**0023 已经铺垫**:
- relations 让嵌套查询"1 次 JOIN"避免 N+1
- transactions 让多表写入原子
- 但**还没**测:大表 / 缺索引 / 慢查询的场景

## 🤔 反思

### 反思 1 · 模式 B 撞的错比模式 A 多 — 但都是真错

模式 A(读 + quiz)用户**没真写代码**,所以没撞错。
模式 B(读 + 写代码)撞了 3 个错,**全是真有意义的错**(drizzle 类型推断 bug 是真坑)。

**结论**:**模式 B 学习效果 > 模式 A**(撞坑比读 + quiz 学得多)。

### 反思 2 · 方案 D 是"被迫做的"

我本来想偷懒不加 `.vscode/settings.json`,但用户问"项目级别配置"—— 顺势做了方案 D。

**意外收益**:方案 D 间接修了一个真 bug(`ReturnType<typeof drizzle>` 推断为 `{}`)。**用户问对了问题**。

### 反思 3 · 0023 quiz 比 0022 quiz 答得更好

| | 0022 quiz | 0023 quiz |
|---|---|---|
| 第一轮 | 1/3 | (直答 3/3,但深度需补) |
| 第二轮 | 3/3 | n/a |

**0023 quiz 答得好的原因**:**用户真写了代码,quiz 是从代码经验里抽出来的**(不是纯记忆)。

**Lesson 设计含义**:**quiz 跟代码实操挂钩**比**quiz 纯考概念**质量高。模式 B 天然支持这一点。

---

## 下一节预告

**0024 = Drizzle 性能(N+1 / 索引 / 查询计划)**

预期:
- drizzle explain / explain analyze
- 索引设计原则
- N+1 检测
- 实测慢查询

要继续开 0024?