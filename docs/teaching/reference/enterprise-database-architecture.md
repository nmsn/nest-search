# 企业级数据库架构 · nest-search 实战

> 涵盖 **企业级应用为什么禁用外键 + 替代方案**、**高并发调优**、**分库分表**、**微服务 Database per Service** 四大主题。每个主题都给出 nest-search 现状 + 改造建议,让理论能落到代码。
>
> **2026-06-24 更新**:nest-search 数据库从 MySQL 迁到 PostgreSQL(详见 `changelog` 节),所有示例用 PG 语法。
>
> 维护人:教学 skill 自动维护(每次 Phase E 课完成后更新)。
>
> 相关:`reference/drizzle-orm-reference.md`(Drizzle API 用法,本文是架构层)。

## 导航

- §1 [企业级应用为什么禁用外键](#1-企业级应用为什么禁用外键)
- §2 [替代方案:5 种业务一致性保障](#2-替代方案5-种业务一致性保障)
- §3 [高并发:连接池 / 读写分离 / 缓存](#3-高并发连接池--读写分离--缓存)
- §4 [分库分表:垂直 / 水平 / 中间件](#4-分库分表垂直--水平--中间件)
- §5 [分布式事务:TCC / Saga / Outbox](#5-分布式事务tcc--saga--outbox)
- §6 [微服务 Database per Service](#6-微服务-database-per-service)
- §7 [nest-search 现状盘点](#7-nest-search-现状盘点)
- §8 [改造路线图(Phase E 6 节)](#8-改造路线图phase-e-6-节)
- §9 [关键来源](#9-关键来源)

---

## §1. 企业级应用为什么禁用外键

### 1.1 5 个"成本"

#### 成本 A · 写入性能损耗

每次 `INSERT` / `UPDATE` 子表行,InnoDB 都要去父表检查对应行是否存在 + 加 S-lock。批量插入时,每行额外一次 `SELECT` 检查 + 一次 lock。

**实测**:有 FK 的子表 `INSERT` 比无 FK 慢 5-15%(数据量大时)。

#### 成本 B · 锁竞争 / 死锁

父表某行被 `UPDATE` 时,持有 X-lock;此时子表 `INSERT` 引用该行 → 子表请求 S-lock,会被阻塞。高并发下:
- 父子表互锁 → 死锁
- 死锁回滚 → 上层 retry → 雪崩

#### 成本 C · 分库分表时根本不可能

FK 要求父子表在**同一个 DB 实例**(同一个 connection 验证约束)。一旦分库:
- 跨 DB 实例没有事务边界
- 跨 DB 实例没有锁机制
- FK 约束没法验证

**结论**:一旦决定分库,FK 必须先拆。

#### 成本 D · 微服务时不可能

服务 A 的 `orders.user_id` 想引用服务 B 的 `users.id`?
- 服务 B 的 `users` 在另一个 DB
- 服务 A 没权限直连服务 B 的 DB
- FK 没法跨 service 边界

#### 成本 E · 灾难恢复受限

主从切换 / 备份恢复 / 数据迁移时,FK 约束会强制"导入顺序":
- 必须先导父表
- 必须先导从父表导的快照时刻
- 失败时回滚困难

### 1.2 业界共识

> **《阿里 Java 开发手册》MySQL 规约**:
> "**不得使用外键与级联**,一切外键概念必须在应用层解决。"
>
> 理由:每次 `UPDATE / DELETE` 都涉及外键检查,影响性能;分库分表后无法使用;强耦合。

> **Amazon / Google SRE 经验**:
> "Application-level integrity checks are preferred over database-level constraints in distributed systems."
> 数据库级约束在分布式系统里**不可靠**,应用层检查 + 异步对账才是兜底。

> **Percona Live 共识**:
> FK 在 OLTP 高并发场景基本被禁;OLAP 数仓偶有保留。

---

## §2. 替代方案:5 种业务一致性保障

| 方案 | 实现位置 | 适用场景 | 一致性强度 |
|---|---|---|---|
| **应用层一致性检查** | service 代码 | 单 service 内,同步路径 | 强 |
| **软删除** | DB + 代码 | 避免孤儿数据 | 强(防误删) |
| **定期对账(job)** | cron / scheduled task | 兜底,补偿漏掉的 | 最终 |
| **Outbox 模式** | DB outbox 表 + worker | 跨 service 异步同步 | 最终 |
| **Saga 模式** | 编排 + 补偿 | 跨多 service 复杂事务 | 最终 |

### 2.1 应用层一致性检查

**例**:创建 ticket 时,service 层先查 user 存在,再 INSERT ticket。

```ts
async createTicket(userId: number, ticket: string) {
  // 1. 应用层检查(替代 FK 约束)
  const user = await this.userService.findById(userId);
  if (!user) {
    throw new NotFoundException(`User ${userId} not found`);
  }

  // 2. 写入
  await this.db.insert(casTickets).values({ userId, ticket, ... });
}
```

**代价**:多一次 `SELECT`。但可以缓存 user 信息降级(用 Redis)。

### 2.2 软删除

**例**:`users` 表加 `deleted_at` 字段,所有 DELETE 改成 UPDATE。

```sql
-- schema
deletedAt: timestamp('deleted_at').default(null),  -- null = 未删
```

```ts
// service
async deleteUser(id: number) {
  await this.db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, id));
}

// 查询时过滤
.where(isNull(users.deletedAt))
```

**好处**:误删可恢复;审计追溯;FK 替代(子表数据不孤立)。

### 2.3 定期对账(job)

**例**:每个整点跑一次,扫"孤儿 ticket"(userId 不存在)。

```ts
@Cron('0 * * * *')  // 每小时
async reconcileOrphanTickets() {
  // 1. 找出孤儿
  const orphans = await this.db
    .select({ id: casTickets.id, userId: casTickets.userId })
    .from(casTickets)
    .leftJoin(users, eq(casTickets.userId, users.id))
    .where(isNull(users.id));

  if (orphans.length) {
    this.logger.warn({ count: orphans.length, orphans }, 'Found orphan tickets');
    // 2. 补偿:标记为无效 / 发通知 / 业务处理
    await this.markInvalidTickets(orphans.map(o => o.id));
  }
}
```

**好处**:兜底应用层漏掉的 case。

### 2.4 Outbox 模式

**场景**:创建 user 后,要发"欢迎邮件" + 同步到 search-service。

**错误做法**:
```ts
// ❌ 跨 service 副作用,无事务保护
await this.userService.create(dto);
await this.emailService.sendWelcomeEmail(dto);
await this.searchSyncService.indexUser(dto);
// 任一失败 → 不一致
```

**正确做法(Outbox)**:
```ts
// 同一个 DB 事务:写 user + 写 outbox 事件
await this.db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({...}).$returningId();

  // outbox 表:同 DB,事务保证
  await tx.insert(outbox).values({
    eventType: 'user.created',
    payload: { userId: user.id, ... },
    status: 'pending',
  });
});

// Worker 异步读 outbox,推送 RabbitMQ → 多个消费者
// 消费者消费后,UPDATE outbox SET status = 'processed'
```

**好处**:
- 写 user 和"通知外部"在同一个 DB 事务里原子
- 即使 RabbitMQ 挂了,outbox 表里事件还在(持久)
- Worker 重试,最终一致

### 2.5 Saga 模式

**场景**:跨 3 个 service 的复杂事务(创建订单 → 扣库存 → 支付 → 发货)。

**Saga 思路**:把大事务拆成 N 个本地事务 + N 个补偿事务。

```ts
// 步骤 1:创建订单
async createOrderSaga(input) {
  const orderId = await this.orderService.create(input);

  try {
    // 步骤 2:扣库存(本地事务)
    await this.inventoryService.deduct(orderId, input.items);
  } catch (e) {
    // 步骤 2 补偿:取消订单
    await this.orderService.cancel(orderId);
    throw e;
  }

  try {
    // 步骤 3:扣款(本地事务)
    await this.paymentService.charge(orderId, input.amount);
  } catch (e) {
    // 步骤 3 补偿:补回库存
    await this.inventoryService.restock(orderId, input.items);
    await this.orderService.cancel(orderId);
    throw e;
  }
  // ...
}
```

**实现方式**:
- **Orchestration**(编排式):中央 saga 协调器调各 service
- **Choreography**(编舞式):各 service 通过 event 触发下一步

**代码复杂度高**,nest-search 暂时不需要。

---

## §3. 高并发:连接池 / 读写分离 / 缓存

### 3.1 连接池调优

#### PostgreSQL server 端

| 参数 | 默认 | prod 建议 | 理由 |
|---|---|---|---|
| `max_connections` | 100 | 200-500 | PG 每个连接占更多内存(默认 ~10MB),比 MySQL 贵 |
| `idle_in_transaction_session_timeout` | 0(无限) | 60s | 避免事务挂起锁住行 |
| `shared_buffers` | 128M | 物理内存 25% | 缓存热数据(注意:OS 缓存也用一部分) |
| `effective_cache_size` | 4G | 物理内存 50-75% | 给 planner 估算可用缓存 |
| `work_mem` | 4M | 64-256M | 单 query 排序/哈希内存(注意:每个 sort 一次) |
| `maintenance_work_mem` | 64M | 1-2G | VACUUM / CREATE INDEX 用 |

#### 应用层(`pg`)

```ts
// apps/auth-service/src/database/drizzle.service.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,                       // pool size(看 CPU cores)
  idleTimeoutMillis: 60000,      // 60s 空闲回收
  connectionTimeoutMillis: 5000, // 5s 连接超时
  statement_timeout: 30000,      // 30s query 超时(防慢查询拖死)
  idle_in_transaction_session_timeout: 60000,  // 60s 事务超时
});
```

**经验值**:`max ≈ CPU cores × 2-4`(8 核机器约 16-32)。PG pool 比 MySQL 更贵,因为每个连接占 ~10MB。

**关键差异**:
- PG 的 `statement_timeout` 比 MySQL 的 `wait_timeout` 更精准(只查 query,不杀空闲连接)
- `idle_in_transaction_session_timeout` 防止应用代码忘了 commit(锁积累)

### 3.2 读写分离

#### 主从架构

```
                 ┌────────────────┐
   write ──────► │  Master (主库) │
                 └────────┬───────┘
                          │ async replication (binlog)
                          ↓
                 ┌────────────────┐
   read ───────► │  Replica (从库)│
                 └────────────────┘
```

#### 应用层路由

```ts
// apps/auth-service/src/database/drizzle.service.ts
@Injectable()
export class DrizzleService {
  public masterDb!: NodePgDatabase<Schema>;
  public replicaDb!: NodePgDatabase<Schema>;

  async onModuleInit() {
    const masterUri = this.config.getOrThrow<string>('DATABASE_MASTER_URL');
    const replicaUri = this.config.getOrThrow<string>('DATABASE_REPLICA_URL');

    this.masterDb = drizzle(new Pool({ connectionString: masterUri }), { schema });
    this.replicaDb = drizzle(new Pool({ connectionString: replicaUri }), { schema });
  }
}

// service 层
async findUserById(id: number) {
  // 读走 replica
  return this.drizzle.replicaDb.select().from(users).where(eq(users.id, id));
}

async createUser(input) {
  // 写走 master
  return this.drizzle.masterDb.insert(users).values(input);
}
```

**注意**:replication 有延迟(通常几十 ms ~ 几 s),强一致场景必须走 master。

### 3.3 缓存策略(4 种模式)

| 模式 | 读 | 写 | 一致性 | 复杂度 |
|---|---|---|---|---|
| **Cache-Aside**(最常用) | miss 则查 DB + 回填 cache | 直接写 DB + 失效 cache | 最终 | 低 |
| **Write-Through** | 查 cache | 同时写 cache + DB | 强 | 中 |
| **Write-Behind** | 查 cache | 只写 cache,异步刷 DB | 弱(可能丢) | 高 |
| **Read-Through** | cache 自己查 DB | 直接写 DB,cache 失效 | 最终 | 中 |

#### Cache-Aside 实现(最常用)

```ts
// apps/auth-service/src/user/user.service.ts
async findById(id: number) {
  const cacheKey = `user:${id}`;

  // 1. 查 cache
  const cached = await this.redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. cache miss → 查 DB
  const [user] = await this.db.select().from(users).where(eq(users.id, id));
  if (!user) return null;

  // 3. 回填 cache(TTL 5 分钟)
  await this.redis.set(cacheKey, JSON.stringify(user), 'EX', 300);

  return user;
}

async updateUser(id: number, input) {
  await this.db.update(users).set(input).where(eq(users.id, id));
  // 写后失效 cache(下次读会重新加载)
  await this.redis.del(`user:${id}`);
}
```

**坑**:
- **缓存穿透**:同一 key 反复 miss → 查 DB。解决:cache 空值 / 布隆过滤器
- **缓存雪崩**:大批 key 同时过期 → DB 被打爆。解决:TTL 加随机抖动 / 永不过期 + 后台刷新
- **缓存击穿**:热点 key 过期瞬间被并发请求。解决:分布式锁 / singleflight

### 3.4 nest-search 现状

- ✅ Redis (ioredis) 已装但**仅用限流**
- ❌ 没用做 DB cache
- ❌ 没有读写分离
- ⚠️ pg pool 用默认值,无显式配置

### 3.5 改造建议(Phase E 0026-0027)

- 0026 lesson:加 pg pool 显式配置 + 演示 EXPLAIN 在高并发场景
- 0027 lesson:auth-service 的 `findUserById` 加 Cache-Aside

---

## §4. 分库分表:垂直 / 水平 / 中间件

### 4.1 为什么分

单库瓶颈:
- **磁盘**:单盘 IOPS 上限 ~ 几万
- **内存**:buffer pool 装不下热数据
- **CPU**:复杂查询 / 高并发写
- **网络**:跨 AZ 延迟

**经验阈值**:
- 单表行数 > 5000 万 → 考虑水平分表
- 单库数据量 > 2TB → 考虑分库
- 单库写 TPS > 1 万 → 考虑分库

### 4.2 垂直拆分(按业务 / 模块)

```
DB_users:  users, cas_tickets, cas_services
DB_business: business_lines, sync_records
DB_search: search_index
```

**适合**:不同业务访问频率差异大 / 团队边界清晰。

**nest-search 已经做了**(5 service 各 1 个 DB)。

### 4.3 水平拆分(按数据特征)

```
users_db_0: users WHERE id % 4 = 0
users_db_1: users WHERE id % 4 = 1
users_db_2: users WHERE id % 4 = 2
users_db_3: users WHERE id % 4 = 3
```

**sharding key**:路由键(常用 `user_id` / `order_id` / 时间)。

**三种分片策略**:

| 策略 | 算法 | 优点 | 缺点 |
|---|---|---|---|
| **Hash 取模** | `id % N` | 数据均匀 | 扩缩容要 rehash |
| **Range** | `id ∈ [0, 1M)` → 库 0 | 范围查询友好 | 可能数据倾斜(新数据热) |
| **时间** | `created_at 按月分` | 冷热分离自然 | 老数据难访问 |

### 4.4 中间件

| 中间件 | 类型 | 特点 | 适用 |
|---|---|---|---|
| **ShardingSphere-JDBC** | 客户端 jar | 应用层嵌入,无 proxy | Java 生态主流 |
| **Vitess** | Proxy 集群 | YouTube 开源,10+ 年生产 | 大规模 MySQL(对 PG 支持有限) |
| **MyCat** | Proxy | 中文社区强 | 国内中小厂(MySQL) |
| **ProxySQL** | Proxy | 主要读写分离 + 负载均衡 | 不直接分片 |
| **Citus** | PG 扩展 | PostgreSQL 原生水平分表 | **PG 生态首选** |
| **TiDB** | NewSQL | MySQL 协议兼容 + 分布式 | 全新项目可考虑 |
| **CockroachDB** | NewSQL | PG 协议兼容 + 分布式 | 全新项目可考虑 |

**nest-search 选型建议**:Node.js 生态下没有完美 sharding 中间件,演示用**应用层手写路由**(最简单可控)。

### 4.5 分布式 ID

水平分表后,`AUTO_INCREMENT` 失效(单库不连续)。

| 方案 | 长度 | 特点 |
|---|---|---|
| **Snowflake** | 64 bit | Twitter 开源,1 ID/机器/ms,趋势递增 |
| **Leaf** | 64 bit | 美团(Snowflake 改进,支持 DB 分配 workerId) |
| **Redis INCR** | 64 bit | 简单,但单点 + 增加一次网络 |
| **UUID v4** | 128 bit | 随机,**不推荐**(B+tree 插入性能差) |
| **UUID v7** | 128 bit | 时间有序,新趋势 |

#### Snowflake ID 结构(64 bit)

```
0 | 0000... | 00000 00000 00000 00000 00000 0 | 00000 00000 | 00000 00000 00000 00000 0
^     ^                       ^                       ^                  ^
符号位  时间戳(41 bit)         数据中心(5 bit)          机器(5 bit)         序列号(12 bit)
```

可撑**单机每毫秒 4096 个 ID**,41 bit 时间戳可用 69 年。

### 4.6 nest-search 现状

- ✅ 5 service 垂直分库
- ❌ 没有水平分表(数据量不够)

### 4.7 改造建议(Phase E 0028)

- 演示 casTickets 模拟水平分表(2 个 DB,`userId % 2` 路由)
- 应用层手写 router,不改 Drizzle(因为是 Node 生态)
- 加 snowflake-like ID 生成器

---

## §5. 分布式事务:TCC / Saga / Outbox

### 5.1 为什么需要

分库后,跨库 JOIN / 跨库事务都不可能本地实现(PG 事务只跨一个 connection)。

### 5.2 4 种方案对比

| 方案 | 一致性 | 性能 | 复杂度 | 适用 |
|---|---|---|---|---|
| **2PC / XA** | 强 | 差 | 高 | 几乎不用 |
| **TCC** | 最终 | 好 | 很高 | 金融核心 |
| **Saga** | 最终 | 好 | 高 | 长事务 |
| **Outbox + 异步** | 最终 | 最好 | 中 | **最常用** |

### 5.3 Outbox 实现详解

#### Schema

```ts
// outbox 表
export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),  // 'user.created'
  payload: jsonb('payload').notNull(),                         // PG 推荐 jsonb(二进制 + 索引)
  status: outboxStatusEnum('status').default('pending'),
  retryCount: integer('retry_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'processed', 'failed']);
```

#### 写入(同事务)

```ts
async createUserWithOutboxEvent(input) {
  await this.db.transaction(async (tx) => {
    // 1. 写 user
    const [user] = await tx.insert(users).values({...}).$returningId();

    // 2. 写 outbox(同一事务,原子)
    await tx.insert(outbox).values({
      eventType: 'user.created',
      payload: { userId: user.id, username: input.username },
      status: 'pending',
    });
  });
  // 事务提交 → user 和 outbox 同时落盘
}
```

#### Worker 处理

```ts
@Cron('*/5 * * * * *')  // 每 5 秒
async processOutbox() {
  // 1. 捞 pending 事件(限制条数,防止一次处理太多)
  const events = await this.db
    .select()
    .from(outbox)
    .where(eq(outbox.status, 'pending'))
    .limit(100);

  for (const evt of events) {
    try {
      // 2. 推到 RabbitMQ(或其他下游)
      await this.rabbitmq.publish(evt.eventType, evt.payload);

      // 3. 标记 processed
      await this.db.update(outbox)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(outbox.id, evt.id));
    } catch (e) {
      // 4. 失败:retry
      await this.db.update(outbox)
        .set({ retryCount: evt.retryCount + 1 })
        .where(eq(outbox.id, evt.id));
    }
  }
}
```

**幂等性**:消费者必须支持**重复消费**(因为 outbox 推成功但 UPDATE 失败 → 重复推)。在 payload 里加 `eventId`,消费者去重。

### 5.4 nest-search 改造建议(Phase E 0029)

- 加 outbox 表到 auth-service
- createUserWithTicket(已有事务)加 outbox 写入
- 加 worker(Cron)推到 RabbitMQ(已装 amqplib)

---

## §6. 微服务 Database per Service

### 6.1 核心原则(Chris Richardson / microservices.io)

> "Each microservice must own its database. No other service is allowed to access the database directly."

### 6.2 4 个理由

1. **独立部署**:service A 改 schema 不影响 service B
2. **技术异构**:service A 用 PostgreSQL,service B 用 MongoDB / ES / Redis
3. **故障隔离**:service A 的 DB 挂了不影响 B
4. **独立伸缩**:DB 单独扩缩容

### 6.3 跨服务数据访问的 5 种模式

(microservices.io)

1. **API Composition**:A 通过 B 的 API 拿数据
2. **CQRS**:维护"读视图",异步从多 service 聚合
3. **Event Sourcing**:通过事件流 replay 数据
4. **Saga**:跨服务事务用 Saga 协调
5. **Shared Database**(❌ 反模式):多 service 共享一个 DB

### 6.4 nest-search 现状盘点

```
apps/auth-service       → DB: nest_search (own)        ✅ 符合 DB per Service
apps/form-service       → DB: nest_search (shared!)    ❌ 跟 auth 共享
apps/sync-service       → DB: nest_search (shared!)    ❌ 跟 auth 共享
apps/search-service     → DB: nest_search_xxx?         ⚠️ 待查
apps/gateway            → DB: 无                       ✅ 无 DB
```

**问题**:
- form-service 用了 `casTickets` 表(cross-service!反模式)
- sync-service 通过 schema-factory 动态生成表,本质上也是"共享 DB 池"

### 6.5 改造建议(Phase E 0030)

- form-service 拆出独立 DB(nest_search_form)
- sync-service 拆出独立 DB(nest_search_sync)
- 跨 service 数据通过 API Composition / MQ(不是直连 DB)

---

## §7. nest-search 现状盘点(综合)

```
┌─────────────────────────────────────────────────────────────┐
│ apps/auth-service                                            │
│  DB: nest_search                                            │
│  表: users / cas_tickets / cas_services                     │
│  外键: ❌ 无(cas_tickets.userId 是 int notNull,无 .references)│
│  Relations: ✅ drizzle relations.ts 类型层(查询辅助,非 DB FK) │
│  缓存: ❌ 无 Redis cache                                    │
│  读写分离: ❌ 无                                            │
│  水平分表: ❌ 无                                            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ apps/form-service                                            │
│  DB: nest_search (共用!)                                    │
│  表: business_lines + 动态(ds_*, zk_*, ...)                │
│  问题: ❌ 跨 service 共享 DB(反模式)                        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ apps/sync-service                                            │
│  DB: nest_search (共用!)                                    │
│  表: sync_records + 业务线动态                              │
│  问题: ❌ 跨 service 共享 DB(反模式)                        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ apps/search-service                                          │
│  DB: 独立?                                                  │
│  缓存: ES (已装)                                            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ apps/gateway                                                 │
│  DB: 无                                                     │
│  用途: 路由 + 鉴权代理                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## §8. 改造路线图(Phase E 6 节)

| 课 | 主题 | nest-search 改造动作 |
|---|---|---|
| **0051** | 外键禁用 + 业务一致性 | cas_tickets.userId 显式无 FK(确认);service 层加 user 存在性检查;加 `deletedAt` 软删除字段 |
| **0052** | 高并发 + 连接池 | pg pool 显式配置(max / idleTimeout / statement_timeout);演示 EXPLAIN 在高并发场景 |
| **0053** | 缓存策略 | auth-service 的 `findUserById` 加 Cache-Aside(Redis);处理穿透/雪崩/击穿 |
| **0054** | 分库分表 | casTickets 模拟水平分表(2 个 DB,userId % 2 路由);加 snowflake-like ID |
| **0055** | 分布式事务 + Outbox | createUserWithTicket 加 outbox 写入;Cron worker 推到 RabbitMQ(已有 amqplib) |
| **0056** | 微服务 DB per Service | form-service / sync-service 拆独立 DB;跨 service 数据走 API |

**总耗时估计**:6 节 × ~1 小时 = ~6 小时(分散在多 session)

---

## §9. 关键来源

> 以下链接是行业权威来源,部分 URL 因网络限制未在编写时 fetch 验证,**请用户自行校验版本**。

### 数据库架构

- [《数据密集型应用系统设计》(DDIA, Martin Kleppmann)](https://dataintensive.net/)
  第 5 章"复制"、第 6 章"分区"、第 7 章"事务"、第 9 章"一致性与共识"。**强烈推荐全书**。
- [《阿里 Java 开发手册》MySQL 规约](https://developer.aliyun.com/topic/java-development-manual)
  "不得使用外键与级联,一切外键概念必须在应用层解决。"(PG 同样适用)
- [PostgreSQL 官方手册 — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
  PG 官方对外键的实现细节 + 性能影响。
- [Percona Database Performance Blog](https://www.percona.com/blog/)
  数据库调优实战文章最密集的来源(覆盖 MySQL + PG)。

### 分库分表

- [Apache ShardingSphere 官方文档](https://shardingsphere.apache.org/document/current/en/overview/)
  Java 生态最主流 sharding 中间件。
- [Citus 文档](https://docs.citusdata.com/)
  **PostgreSQL 原生水平分表扩展** — Phase E 0054 nest-search 选型优先参考。
- [Vitess 官方文档](https://vitess.io/docs/)
  YouTube 开源,Square / Slack / JD 等大厂生产在用(MySQL 协议)。
- [PingCAP TiDB 文档](https://docs.pingcap.com/tidb/stable)
  分布式 NewSQL,跟 MySQL 协议兼容。
- [CockroachDB 文档](https://www.cockroachlabs.com/docs/)
  分布式 NewSQL,跟 PostgreSQL 协议兼容 — PG 生态替代。

### 微服务

- [microservices.io — Chris Richardson](https://microservices.io/patterns/data/database-per-service.html)
  微服务模式权威目录,Saga / Database per Service / CQRS 等都来自这里。
- [《微服务架构设计模式》(Chris Richardson)](https://microservices.io/book)
  上述网站的书版,实战代码例子最丰富。
- [Microsoft Azure Architecture Center — Data considerations for microservices](https://learn.microsoft.com/en-us/azure/architecture/microservices/data/data-considerations)

### 分布式 ID

- [Twitter Snowflake 原版](https://github.com/twitter-archive/snowflake)
- [美团 Leaf](https://github.com/Meituan-Dianping/Leaf)

### Outbox / Saga

- [Microservices.io — Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Microservices.io — Pattern: Saga](https://microservices.io/patterns/data/saga.html)

---

## 📋 版本与升级

| 主题 | 当前 nest-search 状态 | 目标(Phase E 完后) |
|---|---|---|
| 外键使用 | ❌ 无(已对) | 保持 + 加应用层校验 |
| 软删除 | ❌ 无 | 加 `deletedAt` |
| 连接池 | ⚠️ pg 默认 | 显式配置 |
| 读写分离 | ❌ 无 | 演示版(master/replica 同 DB 不同 conn) |
| 缓存 | ❌ 无 DB cache | Cache-Aside on auth |
| 分库分表 | ✅ 垂直(5 service 各 1 DB) | 加水平分表演示 |
| 分布式事务 | ❌ 无 | Outbox |
| 微服务 DB | ⚠️ 部分共享 | 全独立 |

---

**维护说明**:这份文档每完成一个 Phase E 课程都会更新(从实战中提炼架构知识)。
