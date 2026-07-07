# 0066 · 分布式事务:Outbox 模式

> Phase E 第 5 课。nest-search 当前跨 service 副作用**无事务保护**(例:注册 user 后,发欢迎邮件、发 IM 通知,任一失败都数据不一致)。
> 本节引入 **Outbox 模式** — 工业界最常用的兜底方案。

## 你今天会拿到什么

1. 理解 **4 种分布式事务方案**(2PC / TCC / Saga / Outbox)
2. 理解 **Outbox 模式原理**(业务表 + outbox 表同事务写入)
3. 写一个 **Outbox worker**(定时捞 pending → 推 BullMQ → 标记 processed)
4. 理解 **幂等性**(为什么消费者必须去重)
5. nest-search 实战
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 真实场景

```ts
// 用户注册:5 步
async register(dto) {
  // 1. 写 users 表
  await this.db.insert(users).values({...});

  // 2. 发欢迎邮件
  await this.emailService.send(dto.email, 'welcome');

  // 3. 发 IM 通知给 admin
  await this.imService.notify(adminId, 'new user');

  // 4. 创建 cas_ticket(TGT)
  await this.casService.issueTgt(userId);

  // 5. 同步到 Elasticsearch
  await this.searchService.indexUser(user);
}
```

### 1.2 失败的灾难

```
步骤 1 成功 → 步骤 3 失败
→ users 表有数据,但 admin 没收到通知
→ 数据不一致

步骤 1 成功 → 步骤 4 成功 → 步骤 5 失败
→ ES 没数据,用户搜不到自己
→ 数据不一致
```

**根因**:**每个步骤是独立调用,任何一个失败,前面成功的不会回滚**。

### 1.3 nest-search 现状

```
❌ 跨 service 副作用无事务保护
❌ 失败时数据不一致风险
❌ 没有补偿机制(retry / outbox / saga)
```

---

## §2. 4 种分布式事务方案

### 2.1 2PC(两阶段提交)

```
协调者 ─── prepare ───→ 所有参与者
协调者 ←─── vote ───── 所有参与者
协调者 ─── commit ────→ 所有参与者
```

**优点**:强一致
**缺点**:协调者 SPOF、同步阻塞、性能差(2 次 RTT)

**适用**:银行核心系统、订单支付
**nest-search**:**不用**(太重)

### 2.2 TCC(Try-Confirm-Cancel)

```
Try:     预留资源(冻结库存)
Confirm: 真正执行业务
Cancel:  释放预留资源
```

**优点**:性能比 2PC 好
**缺点**:业务侵入性强(每个操作都要写 Try/Confirm/Cancel)

**适用**:电商库存、支付
**nest-search**:**不用**(侵入重)

### 2.3 Saga

```
T1 → T2 → T3 → T4(成功路径)
              ↓
         C4 ← C3 ← C2 ← C1(补偿路径)
```

**优点**:长事务友好
**缺点**:补偿逻辑复杂,需要每个服务都写补偿接口

**适用**:旅行预订(机票+酒店+租车)
**nest-search**:**未来用**(0067 微服务后再考虑)

### 2.4 Outbox(本节)

```
业务表 + outbox 表(同事务写入)
        ↓
    定时 worker
        ↓
  推 BullMQ / Kafka
        ↓
    消费者处理
```

**优点**:简单、可靠、与业务解耦
**缺点**:有延迟(取决于 worker 轮询间隔)

**适用**:**90% 场景**,nest-search 用这个
**nest-search**:**✅ 本节实战**

### 2.5 对比

| 方案 | 一致性 | 性能 | 复杂度 | 延迟 | nest-search |
|---|---|---|---|---|---|
| 2PC | 强 | 差 | 高 | 低 | ❌ |
| TCC | 强 | 中 | 很高 | 低 | ❌ |
| Saga | 最终 | 好 | 中 | 中 | 未来 |
| **Outbox** | **最终** | **好** | **低** | **秒级** | **✅** |

---

## §3. Outbox 模式原理

### 3.1 核心思想

```
"业务表和 outbox 表 在同一事务里写入"
→ 业务成功 = outbox 也有记录(同生共死)
→ 失败的副作用 → outbox 帮我们重试
```

### 3.2 时序图

```
t=0  客户端调用 register(dto)
t=1  BEGIN TRANSACTION
t=2    INSERT INTO users ...
t=3    INSERT INTO outbox (event='user.created', payload=...)
t=4  COMMIT
t=5  ← 返回 201
─────────────────────────────────────
t=6  worker 每 5 秒扫一次 outbox
t=7    SELECT * FROM outbox WHERE status='pending' LIMIT 100
t=8    推到 BullMQ('user.created', payload)
t=9    UPDATE outbox SET status='processed' WHERE id=...
─────────────────────────────────────
t=10 BullMQ consumer 收到事件
t=11   发邮件 / 同步 ES / 发 IM
t=12   标记业务完成
```

**关键点**:
- t=4 之前,user 和 outbox 都还没落盘,事务回滚一起回滚
- t=4 之后,user 和 outbox 都落盘,worker 兜底所有副作用
- 步骤 8-9 失败没关系,下次 worker 还会再捞(幂等)

### 3.3 事务边界(关键!)

```ts
// ✅ 正确:user 和 outbox 同事务
await this.db.transaction(async (tx) => {
  await tx.insert(users).values({...});
  await tx.insert(outbox).values({...});
});

// ❌ 错误:两个独立事务
await this.db.insert(users).values({...});     // 事务 1
await this.db.insert(outbox).values({...});    // 事务 2
// 事务 1 成功 + 事务 2 失败 → user 有,outbox 没,event 丢了
```

---

## §4. nest-search 实战

### 4.1 Schema

```ts
// apps/auth-service/src/database/schema/outbox.ts
import {
  pgTable, bigserial, varchar, jsonb, pgEnum, integer, timestamp,
} from 'drizzle-orm/pg-core';

export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending', 'processed', 'failed',
]);

export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: outboxStatusEnum('status').default('pending'),
  retryCount: integer('retry_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});
```

### 4.2 业务方法(同事务写入)

```ts
// user.service.ts
async createWithOutbox(dto: CreateUserDto) {
  return this.drizzle.db.transaction(async (tx) => {
    // 1. 写 user
    const [user] = await tx.insert(users).values({
      username: dto.username,
      passwordHash: await bcrypt.hash(dto.password, 10),
      email: dto.email,
    }).returning({ id: users.id });

    // 2. 写 outbox(同事务)
    await tx.insert(outbox).values({
      eventType: 'user.created',
      payload: { userId: user.id, username: dto.username, email: dto.email },
      status: 'pending',
    });

    return user;
  });
}
```

### 4.3 Worker(定时处理)

```ts
// outbox.worker.ts
@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly bullmq: BullMQService,  // 已有
  ) {}

  /** 每 5 秒跑一次 */
  @Cron('*/5 * * * * *')
  async processOutbox() {
    // 1. 捞 pending(限制 100 条,防一次处理太多)
    const events = await this.drizzle.db
      .select()
      .from(outbox)
      .where(eq(outbox.status, 'pending'))
      .limit(100);

    if (events.length === 0) return;

    this.logger.log(`处理 ${events.length} 个 outbox 事件`);

    for (const evt of events) {
      try {
        // 2. 推 BullMQ
        await this.bullmq.publish(evt.eventType, {
          eventId: evt.id.toString(),   // ← 幂等键
          ...evt.payload as object,
        });

        // 3. 标记 processed
        await this.drizzle.db.update(outbox)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(outbox.id, evt.id));
      } catch (e) {
        // 4. 失败:retry 计数
        await this.drizzle.db.update(outbox)
          .set({ retryCount: evt.retryCount + 1 })
          .where(eq(outbox.id, evt.id));

        // 超过 N 次 → status='failed',人工介入
        if (evt.retryCount + 1 >= 5) {
          await this.drizzle.db.update(outbox)
            .set({ status: 'failed' })
            .where(eq(outbox.id, evt.id));
        }
      }
    }
  }
}
```

---

## §5. 幂等性(关键!)

### 5.1 为什么必须幂等

```
场景:
  t=0  worker 推 BullMQ 成功
  t=1  worker 标记 processed 失败(网络抖动)
  t=5  下次 worker 又捞到这条 → 重复推
  t=10 消费者收到 2 次 'user.created'
  → 发 2 封欢迎邮件
  → 用户投诉
```

**结论**:**消费者必须能识别"重复消息"**。

### 5.2 幂等 3 招

| 招法 | 实现 | 适用 |
|---|---|---|
| **唯一键去重** | consumer 拿 `eventId` 查 DB,有就跳过 | ✅ 通用 |
| **业务幂等** | 业务本身幂等(发邮件用 `Message-ID` 去重) | 邮件/IM |
| **状态机** | 业务有"已处理"状态字段,只处理一次 | 订单状态 |

### 5.3 nest-search 用第一种

```ts
// consumer 端
async handleUserCreated(payload: { eventId: string; userId: number }) {
  // 1. 查 processed_events 表
  const exists = await this.db.select()
    .from(processedEvents)
    .where(eq(processedEvents.eventId, payload.eventId));

  if (exists.length > 0) {
    return;  // 已处理,跳过
  }

  // 2. 真正发邮件
  await this.emailService.send(...);

  // 3. 标记已处理
  await this.db.insert(processedEvents).values({
    eventId: payload.eventId,
  });
}
```

---

## §6. nest-search 改造路径

### 6.1 最小(1 小时)

```
1. 创建 outbox schema
2. user.service.createWithOutbox(同事务写 user + outbox)
3. OutboxWorker(每 5 秒扫,推 BullMQ,标记 processed)
4. consumer 加幂等表 processed_events
5. 21 测试还过
```

### 6.2 完整(2-3 小时)

```
1. 上面
2. cas_ticket 创建也走 outbox('ticket.created' → sync ES)
3. outbox 监控指标(pending count / lag time)
4. 失败事件人工修复页面
```

---

## §7. 关键认知

### 7.1 常见误区

```
❌ "Outbox 太复杂,直接调 API 就行"
   跨 service 一旦有失败,数据不一致很难排查
   Outbox 看似复杂,实际是"故障兜底"

❌ "Worker 5 秒太慢,改成 1 秒"
   太快 = DB 压力大
   真实生产:5-30 秒足够
   真要实时用 CDC(debezium)而不是轮询

❌ "推成功就 commit"
   推成功 + 标记 processed 之间崩 → 重复
   一定要幂等
```

### 7.2 Outbox vs CDC

| 方案 | 原理 | 延迟 | 复杂度 |
|---|---|---|---|
| **Outbox** | 应用层轮询 | 5-30s | 低 |
| **CDC**(Debezium) | 读 WAL binlog | < 1s | 中 |
| **Listen/Notify** | PG 通知 | 实时 | 中 |

nest-search 用 Outbox(够用 + 简单)。

---

## §8. Quiz

**Q1: Outbox 模式的核心思想?**

A) 用消息队列保证一致性
B) 业务表和 outbox 表同事务写入
C) 两阶段提交

**Q2: 为什么消费者必须幂等?**

A) 性能考虑
B) 推成功但标记 processed 失败会重复推
C) 法律规定

**Q3: nest-search 适合什么分布式事务方案?**

A) 2PC
B) Saga
C) Outbox

---

## §9. Commit Message

```
feat(outbox): 0066 分布式事务 Outbox 模式

- outbox schema: eventType + payload(jsonb) + status + retryCount
- user.service.createWithOutbox: 同事务写 user + outbox
- OutboxWorker: @Cron 每 5 秒,推 BullMQ + 标记 processed
- 幂等: payload.eventId,consumer 查 processed_events 去重
- 失败: retryCount >= 5 → status='failed',人工介入
- 21 测试还过
```

---

## §10. 跨节链接

- [0065 · 分库分表](./0065-sharding-snowflake.md) — 上一课
- [0067 · 微服务 Database per Service](./0067-microservice-database.md) — 下一课(Phase E 收官)
- [outbox.worker.ts](../../apps/auth-service/src/outbox/outbox.worker.ts) — 核心实现
