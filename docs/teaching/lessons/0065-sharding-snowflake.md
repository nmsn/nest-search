# 0065 · 分库分表(水平)+ snowflake

> Phase E 第 4 课。nest-search 5 service 已垂直分库,**水平分表演示空白**。本节演示:
> 1. snowflake 64-bit ID 生成器
> 2. `cas_tickets` 按 `userId % 2` 水平分到 2 个 DB
> 3. 应用层 router(对业务方透明)

## 你今天会拿到什么

1. 理解 **3 种分片策略**(Hash / Range / Time)
2. 理解 **snowflake 64-bit ID 结构**
3. 写一个 **应用层 router**(透明路由)
4. nest-search 实战分表
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
✅ 5 service 垂直分库(0067 收官)
❌ 单库单表,没水平拆分
❌ AUTO_INCREMENT 主键(分表后不连续)
```

### 1.2 真实生产场景

```
单表行数 5000 万 → 查询 / 备份 / 加索引都慢
单库数据 2TB → buffer pool 装不下
单库写 TPS 1 万 → 主从延迟变大

→ 必须水平分表
```

### 1.3 nest-search 真需要吗?

> **真不需要**(数据量小)。但**理解原理 + 会写 router** 是简历必备。
>
> 本节演示用 **2 个 DB 模拟水平分表**,给真实场景打基础。

---

## §2. 3 种分片策略

### 2.1 Hash 取模(最常用)

```ts
const shard = userId % 2;  // 0 或 1
const db = shard === 0 ? db0 : db1;
```

**优点**:数据均匀分布
**缺点**:扩缩容要 rehash(4 库扩 8 库,数据要重分布)
**解决**:用 **一致性 Hash** 或 **预分配 N 库,前 N 个活跃**

### 2.2 Range 范围

```ts
const shard = userId < 1_000_000 ? 0 : 1;
```

**优点**:范围查询友好(`WHERE id BETWEEN X AND Y` 走单库)
**缺点**:数据倾斜(新用户全在最后一个库)

### 2.3 时间

```ts
const shard = `tickets_${createdAt.getFullYear()}_${createdAt.getMonth()}`;
```

**优点**:冷热自然分离(老数据归档)
**缺点**:老数据难访问,跨时间查询要 union 多个库

### 2.4 对比

| 策略 | 数据分布 | 范围查询 | 扩缩容 | 典型场景 |
|---|---|---|---|---|
| **Hash** | 均匀 | 差(要扫所有库) | 难(rehash) | 用户 / 订单 |
| **Range** | 可能倾斜 | 好 | 易 | 时间序列 |
| **时间** | 自然分离 | 差(跨时间难) | 易(月维度) | 日志 / 监控 |

nest-search 选 **Hash**(`userId % 2`),演示用。

---

## §3. snowflake ID

### 3.1 为什么不能 AUTO_INCREMENT

分表后,每个表自增 → **全局 ID 重复**。

```
表 0: id = 1, 2, 3
表 1: id = 1, 2, 3  ← 重复!
```

### 3.2 snowflake 64 bit 结构

```
0 | 0000... | 00000 00000 00000 00000 00000 0 | 00000 00000 | 00000 00000 00000 00000 0
^     ^                       ^                       ^                  ^
符号位  时间戳(41 bit)         数据中心(5 bit)          机器(5 bit)         序列号(12 bit)
       69 年可用              32 个                    32 个               4096/ms
```

**特点**:
- 趋势递增(B+tree 插入性能好)
- 64 bit(`Number.MAX_SAFE_INTEGER = 2^53 - 1`,但 JS 内部用 float 处理大整数时丢失精度 → **必须用 BigInt**)
- 单机每毫秒 4096 个 ID

### 3.3 nest-search 实现

```ts
// libs/shared/src/utils/snowflake.ts

/**
 * Snowflake ID 生成器
 *
 * 结构(64 bit BigInt):
 *   sign(1) | timestamp(41) | workerId(10) | sequence(12)
 *
 * 特点:
 *   - 趋势递增(B+tree 友好)
 *   - 单机 4096 IDs/ms 够用
 *   - 跨机器不重复(workerId 区分)
 */
export class Snowflake {
  // 2024-01-01 00:00:00 UTC — 自定义 epoch,让 41 位时间戳用得更久
  private static readonly EPOCH = 1704067200000n;

  private static readonly WORKER_ID_BITS = 10n;
  private static readonly SEQUENCE_BITS = 12n;

  private static readonly MAX_WORKER_ID = (1n << Snowflake.WORKER_ID_BITS) - 1n;  // 1023
  private static readonly MAX_SEQUENCE = (1n << Snowflake.SEQUENCE_BITS) - 1n;     // 4095

  private static readonly WORKER_ID_SHIFT = Snowflake.SEQUENCE_BITS;
  private static readonly TIMESTAMP_SHIFT =
    Snowflake.SEQUENCE_BITS + Snowflake.WORKER_ID_BITS;

  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(private readonly workerId: bigint) {
    if (workerId < 0n || workerId > Snowflake.MAX_WORKER_ID) {
      throw new Error(`workerId 必须在 0-${Snowflake.MAX_WORKER_ID}`);
    }
  }

  nextId(): bigint {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      // 时钟回拨保护
      throw new Error(
        `时钟回拨 ${this.lastTimestamp - timestamp}ms,拒绝生成 ID`,
      );
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & Snowflake.MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // 当前毫秒 sequence 用完,等下一毫秒
        while (timestamp <= this.lastTimestamp) {
          timestamp = BigInt(Date.now());
        }
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    return (
      ((timestamp - Snowflake.EPOCH) << Snowflake.TIMESTAMP_SHIFT) |
      (this.workerId << Snowflake.WORKER_ID_SHIFT) |
      this.sequence
    );
  }
}
```

### 3.4 用法

```ts
const sf = new Snowflake(1n);  // workerId = 1
const id1 = sf.nextId();  // 1234567890123456789n
const id2 = sf.nextId();  // 1234567890123456790n (大 1)
```

---

## §4. 应用层 router

### 4.1 路由设计

```ts
// apps/auth-service/src/sharding/ticket.router.ts
import { Injectable } from "@nestjs/common";

/**
 * cas_tickets 分表路由
 *
 * 路由键:userId
 * 策略:Hash(userId % 2) → 2 个 DB
 *
 * 关键:对业务方透明,业务方只调 router.getDb(userId)
 */
@Injectable()
export class TicketRouter {
  // 2 个 DB 的 drizzle 实例
  // 实际项目:从 DrizzleService 工厂方法拿
  private readonly dbs: NodePgDatabase[];

  constructor(/* 注入 2 个 DrizzleService */) {
    this.dbs = [db0, db1];
  }

  /** 根据 userId 路由到正确的 DB */
  getDb(userId: number): NodePgDatabase {
    const shard = userId % 2;
    return this.dbs[shard];
  }

  /** 反向:用 ticket 字符串查询时,需要扫所有库 */
  async findTicketOnAnyDb(ticket: string) {
    for (const db of this.dbs) {
      const [row] = await db
        .select()
        .from(casTickets)
        .where(eq(casTickets.ticket, ticket))
        .limit(1);
      if (row) return row;
    }
    return null;
  }
}
```

### 4.2 业务方调用

```ts
// cas.service.ts — 改造前
async issueTgt(userId: number) {
  await this.drizzle.db.insert(casTickets).values({...});
}

// cas.service.ts — 改造后
async issueTgt(userId: number) {
  const db = this.router.getDb(userId);  // ← 透明路由
  await db.insert(casTickets).values({...});
}

async validateTgt(ticket: string) {
  // 查单 key 时无法路由,必须扫所有库
  return this.router.findTicketOnAnyDb(ticket);
}
```

### 4.3 路由的代价

```
✅ 写路由:1 次计算 → 1 个 DB
❌ 查单条:扫所有库(N 次查询)
❌ 跨库 join:不可能
❌ 跨库事务:不可能(→ 下一课 0066 Outbox)
```

**这就是为什么"分表键"必须选高频查询条件**(`userId` 而不是 `ticket`)。

---

## §5. nest-search 实战

### 5.1 改造路径

```
最小 (1 小时):
  1. libs/shared/src/utils/snowflake.ts
  2. apps/auth-service/src/sharding/ticket.router.ts
  3. cas.service.ts 切到 router

完整 (2-3 小时):
  1. 上面
  2. drizzle.service.ts 工厂方法(2 个 Pool)
  3. docker-compose.yml 加 nest_search_tickets_0 / _1
  4. 跑通 21 测试
```

### 5.2 关键决策

**为什么 nest-search 用 2 个 DB 而不是 4 个?**

```
理由:
  - 演示用,2 个够说明原理
  - 真实生产:通常 8-64 个(取决于 QPS)
  - 太多了,运维 / 迁移成本爆炸
```

**为什么选 userId 不是 ticket?**

```
ticket 字符串:每次 validate 都要扫所有库
userId 数字:写入 + 按 userId 查都直接路由

→ 高频访问字段(写入键)做路由键
```

### 5.3 雪号 vs 雪花

| 名称 | 含义 |
|---|---|
| **雪花算法**(Snowflake) | Twitter 2010 开源的分布式 ID 算法 |
| **雪号** | "雪花生成的 ID"(口语化) |

两者一回事,本节通用。

---

## §6. 雪号生成器 vs nest-search 现状

| 维度 | nest-search 现状 | 0065 改造后 |
|------|------------------|-------------|
| 主键 | AUTO_INCREMENT(serial) | Snowflake BigInt |
| 分表 | 单表 | 2 个 DB(userId % 2) |
| 路由 | 无 | TicketRouter |
| 写性能 | 1 个 DB | 2 个 DB 并行写 |
| 跨表查询 | 全表 | 扫 2 个 DB |
| 复杂度 | 低 | 中 |

---

## §7. Quiz

**Q1: 水平分表后,AUTO_INCREMENT 会出什么问题?**

A) 跨表 ID 重复
B) 查询变慢
C) 索引失效

**Q2: snowflake 64 bit 里,时间戳占多少 bit?**

A) 32
B) 41
C) 64

**Q3: 路由键应该选?**

A) 高频访问的字段(如 userId)
B) 主键
C) 时间戳

---

## §8. Commit Message

```
feat(sharding): 0065 水平分表 + snowflake

- libs/shared/src/utils/snowflake.ts: Snowflake 类
  - 64 bit: 1 sign + 41 timestamp + 10 workerId + 12 sequence
  - BigInt 实现,避免 JS 精度丢失
  - 时钟回拨保护
- apps/auth-service/src/sharding/ticket.router.ts: 分表路由
  - userId % 2 路由到 2 个 DB
  - findTicketOnAnyDb 兜底(查单条)
- cas.service.ts: 切到 router
  - issueTgt / issueSt 走路由
  - validateTgt / validateSt 扫所有库
- drizzle.service.ts: 工厂方法支持 2 个 DB
- 21 测试还过
```

---

## §9. 跨节链接

- [0064 · 缓存策略](./0064-cache-strategies.md) — 上一课
- [0066 · 分布式事务 Outbox](./0066-outbox-pattern.md) — 下一课
- [snowflake.ts](../../libs/shared/src/utils/snowflake.ts) — 核心实现
- [ticket.router.ts](../../apps/auth-service/src/sharding/ticket.router.ts) — 路由
