# 0026 — 副线 4 第 1 课:0022 Drizzle Kit + drizzle-zod 反思

> 0022 是"用户读 lesson + 答 quiz"流程的第 1 次实战(我之前漂过,这次严格执行)。
> 用户没有自己写代码(选了 A 路径"读 lesson 理解就够了"),但 quiz 答对了 3 道设计哲学题,说明理解到位。

## 0022 实际产出

| 项 | 内容 |
|---|---|
| 用户角色 | **读 lesson + 答 quiz**(没自己写代码)|
| 学习路径 | lesson md → 读懂 → quiz 3 道(概念 / 业务 / 风险) |
| Quiz 表现 | 第一轮 1/3,第二轮 3/3(理解深度补到位)|
| 代码状态 | `7314e86` commit 还在分支上(我之前代写,LR-0026 反思这个)|
| 参考文档 | 0022 期间新增 2 份(drizzle-orm / validation-libraries)|

## Quiz 回顾 — 3 道题的考点

### Q1 · drizzle-kit 设计哲学(初答:基本对 → 补深度后 ✅)

**考点**:`push` 和 `migrate` 的本质区别,以及为什么 drizzle 团队**故意**分两个命令。

**我的初判**:用户答到"dev 用 push / prod 用 migrate",但没答到"为什么这样设计"。

**正确答案补完**:
```
dev:   schema.ts ─push──► DB        (schema 是 source of truth)
prod:  schema.ts ─gen──► .sql 文件 ─migrate──► DB  (有迁移历史)
```

**drizzle 团队的设计哲学**:
- dev 速度优先:schema 直接同步到 DB,不要中间文件
- prod 安全优先:必须**有 .sql 文件 + 历史**(可回滚 / 可审计 / 可重现)

**用户的盲点**:**没答 prod 必须有迁移历史的 4 个原因**:
1. 可回滚(知道当前 DB 在哪个版本,出问题能精确回到上一个)
2. 可审计(git log 看 schema + 对应 .sql 改动)
3. 可重现(多 server 必须按相同顺序应用)
4. 可追责(每个 .sql 一次 commit,git blame 知道责任人)

`push` 做不到这些,所以**prod 用 push = 没审计 + 没回滚 + 出问题不知道 DB 当前 schema**。

### Q2 · drizzle-zod 推断 DTO 不能直接当 API DTO(初答:不知道 → 二次答 ✅)

**考点**:为什么 `InsertUserDbSchema`(drizzle-zod 从 schema 推断)**不能**当 API register endpoint 的 DTO?

**用户第一次答"不知道"** — 不丢人,这是个深度设计问题,没经验的人想不到。

**第二次答**:"加密 + 认证在非 API 场景"——**精准命中**。

**完整答案补完**:
1. **密码字段名错位**:API 接 `{ password }` 明文,schema 存 `{ passwordHash }` 密文 → **API 层如果接受 passwordHash**,用户就能 POST `{ passwordHash: "xxx" }` 绕过 bcrypt 直接覆盖别人账号(认证绕过)
2. **业务规则责任错位**:bcrypt 是 service 层职责(0022 service.create 把 password → passwordHash),**不应该在 API 层做**——API 层只校验格式,不加密

**核心**:**DTO 分离 = 业务边界隔离**。让 API 层不能直接操作 DB 字段 = 减少攻击面。

### Q3 · prod push 的最坏后果(初答:一半 → 二次答 ✅)

**考点**:`pnpm db:push` 在 prod 误执行会怎样?

**用户答"数据被截断以及永久丢失了"** — **精准命中**。

**完整答案**:
- `MODIFY COLUMN` 把 `VARCHAR(100)` 改成 `VARCHAR(50)` → **所有 > 50 字符的 email 被截断**
- `DROP COLUMN` → **数据永久丢失**(MySQL DDL 不支持事务回滚大部分场景)
- 没有 .sql 文件留底 → **不知道发生了什么、不能回滚**

**0022 参考文档 §11.5**(我后来加的)有完整 DDL 风险表。

## LR 的特殊性

**这次 LR-0026 不是"我撞的反模式",是"用户的学习轨迹"**。

之前 LR(0017-0025)都是"我做了什么,撞了什么坑",这次是:
- 用户主动选择"读 lesson 不写代码"路径
- 通过 quiz 验证理解深度
- quiz 第一轮错 2 道,证明读 ≠ 懂,需要反思深度
- quiz 第二轮答对,说明反思到位

**这才是 lesson 设计的正确反馈机制**:
- lesson 是输入
- quiz 是输出验证
- LR 记录"输入 → 输出"的过程

## nest-search 当前 0022 状态

| 文件 | 状态 |
|---|---|
| `apps/auth-service/src/database/dto/users.dto.ts` | 7314e86 commit 已有 |
| `apps/auth-service/src/common/zod-validation.pipe.ts` | 7314e86 commit 已有 |
| `apps/auth-service/src/user/dto/create-user.dto.ts` | 方案 B 删了(fdff263)|
| `drizzle/0000_big_payback.sql` | 7314e86 commit 已有 |
| `package.json` db:* scripts | 7314e86 commit 已有 |
| **lesson `0022-...md`** | df4f2da 已有 |
| **LR-0026**(本篇)| 8b4a54b 后写 |

**这次 LR 不涉及"代码改动 commit"** —— 用户没写代码,只读 + 答 quiz。

但 lesson 验证流程跑完了,可以进 0023。

## 给 0023 的输入

按 CURRICULUM:
> 0023 = Drizzle Relations API + 事务 + 嵌套查询

预期 0023 学完后:
- 0024 = 性能(N+1 / 索引 / 查询计划)

## 给 lesson 设计流程的反思

### 反思 1 · "读 + quiz" 路径 vs "读 + 写代码" 路径

| 路径 | 适用 | 时间成本 | 学习效果 |
|---|---|---|---|
| **A 读 + quiz** | 时间紧 / 不写业务代码 | 低 | 概念理解 |
| **B 读 + 写代码** | 有时间 / 真要改业务 | 高 | 实战能力 |

nest-search 0022 走 A 路径(用户没写),但**答 quiz 仍然强迫深度思考**(不是"看过就完")。

**lesson 设计应支持两种路径**:
- §3 步骤明确写"如果你只读,跳到这里看概念"
- §3 步骤明确写"如果你写,从这里开始实操"

### 反思 2 · quiz 第一轮错 2 道不是失败

| 状态 | 含义 |
|---|---|
| 第一轮全对 | 可能只是"扫过 lesson 记住了"|
| 第一轮错 + 第二轮对 | **真学了** —— 有思考过程 |
| 第一轮错 + 第二轮还错 | 没真懂,需要重读 lesson |

**0022 走的是"第一轮错 + 第二轮对"** —— 这是最有学习价值的轨迹。

### 反思 3 · 0022 的 3 道 quiz 设计

**Q1 哲学题**(push vs migrate 为什么)— 测设计思想
**Q2 业务题**(DB DTO vs API DTO)— 测业务理解
**Q3 风险题**(prod push 会怎样)— 测安全意识

**3 个维度组合** = 全面理解 0022:
- 哲学(为什么这样设计)
- 业务(实际怎么用)
- 风险(出错会怎样)

下次 lesson quiz 也按这个 3 维度设计。

---

## 下一节预告

**0023 = Drizzle Relations API + 事务 + 嵌套查询**

预期产出:
- 1 个新 service 用 relations 查"用户 + ticket 列表"
- `db.transaction()` 演示多表写入
- e2e 测试覆盖新场景

这次按"读 + quiz"路径走(用户上次选 A),还是"读 + 写代码"路径(用户写 ~2 个文件)?

需要用户选。
