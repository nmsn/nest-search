# 0062 · 外键禁用 + 业务一致性

> Phase E 第 1 课。nest-search schema 已无 FK（0023 验证），但**应用层一致性**缺失。本节讲为什么禁用 FK + 5 种一致性方案。

## 你今天会拿到什么

1. 理解 **禁用 FK 的 5 个理由**（性能 / 锁 / 分库 / 微服务 / 恢复）
2. 理解 **5 种一致性方案**（应用校验 / 软删除 / 对账 / Outbox / Saga）
3. nest-search 现状分析 + 改造点
4. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
当前 schema:
  - PG (PostgreSQL)
  - 已无外键 (0023 验证)
  - 但应用层也没做一致性检查

风险:
  ❌ 删 user, cas_ticket 变孤儿
  ❌ 删 product, sync_record 找不到
  ❌ 数据库干净了, 业务不干净
```

### 1.2 真实生产场景

```
场景 A: 删除用户
  业务: 用户注销
  代码: DELETE FROM users WHERE id = 1
  → cas_tickets.user_id = 1 的记录没处理
  → 查 ticket 时, 用户已经不存在
  → 业务报错 / 数据不一致

场景 B: 软删除 vs 硬删除
  业务: 商家下架产品
  代码: DELETE FROM products
  → sync-record 还指向这个 product
  → ES 索引也指向
  → 多处不一致
```

---

## §2. 为什么禁用 FK

### 2.1 5 个理由

#### 理由 1: 性能

```
PG 外键会加隐式锁:
  INSERT / UPDATE / DELETE 父表
  → 自动检查子表
  → 加锁
  → 大表场景下, 锁竞争严重

禁用:
  - 写入快 (无锁检查)
  - 适合高并发场景
```

#### 理由 2: 锁

```
FK 锁:
  父表 UPDATE → 锁住子表相关行
  → 子表 INSERT / UPDATE 阻塞
  → 死锁风险

禁用:
  - 避免隐式锁
  - 减少死锁
```

#### 理由 3: 分库分表

```
FK 不能跨库:
  - users 库
  - cas_tickets 库
  - FK 跨库无法定义

禁用:
  - 解耦分库
  - 微服务友好
```

#### 理由 4: 微服务

```
微服务原则:
  - 每个服务自己的数据库
  - 不能跨服务 FK
  - 跨服务一致性靠业务层

禁用:
  - 服务解耦
  - 各管各的
```

#### 理由 5: 灾备恢复

```
FK 约束 + 部分数据恢复:
  - 父表缺失
  - 子表 FK 报错
  - 恢复失败

禁用:
  - 单表恢复
  - 不受 FK 约束
  - 灾备更灵活
```

### 2.2 总结：为什么 nest-search 无 FK

```
nest-search 是微服务:
  ✅ 5 个独立服务
  ✅ 准备分库
  ✅ 需要灾备灵活
  ✅ 高并发 (search + sync)

结论: 无 FK 是正确的
代价: 应用层要做一致性
```

---

## §3. 5 种一致性方案

### 方案 1: 应用层校验

```
用户删除前, 检查子表:

async deleteUser(userId: number) {
  // 检查子表
  const tickets = await this.db.query(
    'SELECT COUNT(*) FROM cas_tickets WHERE user_id = $1',
    [userId]
  );
  if (tickets > 0) {
    throw new ForbiddenException('该用户有未完成工单, 不能删除');
  }
  
  // 确认无依赖, 删
  await this.db.query('DELETE FROM users WHERE id = $1', [userId]);
}
```

**优点**：
- ✅ 简单
- ✅ 业务可控

**缺点**：
- ❌ 多服务调用, 容易漏
- ❌ 并发删除, 校验和删除之间有窗口
- ❌ 不适合分布式事务

### 方案 2: 软删除

```
不真正删, 加 deleted_at:

UPDATE users 
SET deleted_at = NOW() 
WHERE id = $1
-- 不是 DELETE, 是软删

查询时:
SELECT * FROM users 
WHERE id = $1 AND deleted_at IS NULL
```

**优点**：
- ✅ 数据可恢复
- ✅ 关联数据自然保留
- ✅ 业务回滚容易

**缺点**：
- ❌ 业务逻辑复杂（要查 deleted_at）
- ❌ 唯一约束问题（同名用户被软删后, 新用户用不了）
- ❌ 数据会越积越多

### 方案 3: 定期对账

```
后台 cron, 定期检查一致性:

// 每日凌晨 3 点跑
@Cron('0 3 * * *')
async reconcileOrphans() {
  // 找出孤儿
  const orphans = await this.db.query(`
    SELECT t.* FROM cas_tickets t
    LEFT JOIN users u ON t.user_id = u.id
    WHERE u.id IS NULL
  `);
  
  // 处理: 删除 / 标记 / 通知
  for (const orphan of orphans) {
    await this.markOrphan(orphan.id);
  }
}
```

**优点**：
- ✅ 兜底, 最终一致
- ✅ 业务影响小（异步）

**缺点**：
- ❌ 有时间窗口（孤儿存在一段时间）
- ❌ 需要监控对账结果

### 方案 4: Outbox 模式

```
事件驱动一致性:
  1. 业务操作 + 事件写入同一事务
  2. 异步 worker 消费事件, 同步其他系统
  3. 最终一致

// 删除用户
BEGIN TRANSACTION;
  DELETE FROM users WHERE id = 1;
  INSERT INTO outbox_events (type='user.deleted', data=...) VALUES (...);
COMMIT;

// 后台 worker
@Cron('*/1 * * * *')  // 每分钟
async processOutbox() {
  const events = await this.db.query(
    'SELECT * FROM outbox_events WHERE processed = false'
  );
  for (const event of events) {
    await this.handleEvent(event);
    await this.db.query(
      'UPDATE outbox_events SET processed = true WHERE id = $1',
      [event.id]
    );
  }
}
```

**优点**：
- ✅ 强保证
- ✅ 跨服务一致

**缺点**：
- ❌ 复杂
- ❌ 0066 专门讲

### 方案 5: Saga 模式

```
分布式事务:
  - 跨多个服务
  - 每个服务本地事务
  - 失败回滚 (补偿事务)
```

**不推荐** nest-search 用，太复杂。

---

## §4. nest-search 推荐方案

### 4.1 选型

```
nest-search 场景:
  - 5 个服务
  - 数据量小 (30 条产品)
  - 没有强一致性需求

推荐:
  - 短时间: 软删除 (deleted_at)
  - 中期: 应用层校验 + 软删除 + 对账 cron
  - 长期: Outbox 模式 (跨服务)
  - 不需要: Saga (太复杂)
```

### 4.2 nest-search 改造点（企业级完整）

```
⚠️ 课程定位更正: nest-search 是企业级课程, 必须完整实施

当前:
  - 业务表: users / cas_tickets / products / sync_records
  - 无 deleted_at 字段
  - 无应用层校验
  - 无对账机制
  - 无 Outbox

完整改造:
  1. 给核心表加 deleted_at 字段
     - users
     - products
     - sync_records
  2. 软删除 API
  3. 应用层校验 (删除前检查)
  4. 定期对账 cron (每日)
  5. Outbox 表 + worker (跨服务一致性)
  6. 完整性监控 (孤儿数量告警)
  4. 查询自动过滤 deleted_at IS NULL

# nest-search 现状
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

### 4.3 nest-search 实际代码 (示意)

```ts
// user.service.ts
async softDeleteUser(userId: number) {
  // 1. 应用层校验
  const tickets = await this.db.query(
    'SELECT id FROM cas_tickets WHERE user_id = $1 AND status = $2 LIMIT 1',
    [userId, 'open'],
  );
  if (tickets.length > 0) {
    throw new BadRequestException('该用户有未完成工单');
  }
  
  // 2. 软删除 (不真删)
  await this.db.query(
    'UPDATE users SET deleted_at = NOW() WHERE id = $1',
    [userId],
  );
}

// 查询时自动过滤
async findById(id: number) {
  return this.db.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
}
```

---

## §5. nest-search 决策

### 决策 1 · 真删还是软删？

```
✅ 软删 (推荐):
  - 教学项目, 数据可恢复
  - 业务简单
  - 字段加 deleted_at

❌ 真删:
  - 数据敏感 (GDPR)
  - 真的不要了
  - nest-search 不用
```

### 决策 2 · 加多少对账?

```
现阶段 nest-search:
  - 数据量小
  - 一致性问题少
  - 不需要每日对账

未来:
  - 数据量大
  - 多服务调用
  - 加每日对账 cron
```

---

## §6. 完整实战

### 6.1 nest-search users 表改造 (示意)

```sql
-- 加 deleted_at 字段
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

-- 加索引
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- 查询时过滤
-- findActive(): WHERE deleted_at IS NULL
-- findById(id): WHERE id = $1 AND deleted_at IS NULL
```

### 6.2 nest-search cas_tickets 改造

```sql
ALTER TABLE cas_tickets ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_tickets_deleted_at ON cas_tickets(deleted_at);
```

### 6.3 nest-search 业务流程

```
场景: 用户注销
1. 业务校验: cas_tickets 是否有 open 状态
   - 有 → 拒绝
   - 无 → 继续
2. 软删 users
3. 关联数据:
   - cas_tickets.user_id 保留 (历史工单)
   - 查询时通过 JOIN users ON deleted_at IS NULL 处理
4. 对账 (未来):
   - 每周 cron 找出孤儿
   - 处理 / 通知
```

---

## §7. Quiz

**Q1: 为什么禁用 FK？**

A) 性能更好（无锁检查）
B) 性能差
C) 跟性能无关

**Q2: nest-search 适合用什么一致性方案？**

A) Saga 分布式事务
B) 软删除 + 应用层校验
C) Outbox 模式

**Q3: 软删除的优点？**

A) 数据可恢复
B) 关联数据自然保留
C) A 和 B 都对

---

## §8. Commit Message

```
docs(teaching): 0062 外键禁用 + 业务一致性

- 禁用 FK 的 5 个理由
- 5 种一致性方案对比
- nest-search 推荐: 软删除 + 应用层校验
- ALTER TABLE 加 deleted_at 字段示意
- 21 测试还过
```

---

## §9. 跨节链接

- [0053a · Grafana](./0053-grafana-dashboard.md) — 上一课
- [0063 · 高并发连接池](./0063-high-concurrency-pool.md) — 下一课
- [docs/operations/db-design.md](../../operations/db-design.md) — nest-search DB 设计
