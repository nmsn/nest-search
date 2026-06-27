# 0033 · Redis 进阶：Streams + Pub/Sub + Pipeline + 性能基准

> Phase B 第 3 课（Redis 深度收官）。0031 讲数据结构，0032 讲分布式锁 + Cache-Aside，0033 讲 **高级用法** + **性能优化**。

## 你今天会拿到什么

1. 理解 **Redis Streams 消费者组**（比 BullMQ 更底层的消息队列）
2. 理解 **Pub/Sub**（实时通知，不持久化）
3. 学会 **Pipeline 批量操作**（减少网络往返）
4. 给 RedisService 加 `pipeline` 方法
5. 用 benchmark 对比 **逐条写入 vs Pipeline 批量写入**
6. 21 测试还过 + 1 个 commit

---

## §1. Redis Streams 深入

### 0031 只讲了基础读写，消费者组才是 Streams 的核心

```
生产者:
  XADD events * action "login" userId 42
  XADD events * action "purchase" userId 42

消费者组 (Consumer Group):
  XGROUP CREATE events mygroup $ MKSTREAM
    ↑ $ = 从最新消息开始消费

  消费者 A:
    XREADGROUP GROUP mygroup consumerA COUNT 1 BLOCK 5000 STREAMS events >
    → 拿到消息,消息标记为 pending

  消费者 A 处理完:
    XACK events mygroup 1687123456789-0
    → 确认消费,从 pending 列表移除
```

### 消费者组 vs List 队列

```
List (BRPOP):
  多个客户端竞争同一个消息 → 只有一个拿到
  消息被 POP 后消失,没有确认机制
  如果消费者崩溃,消息丢失

Stream (消费者组):
  组内每个消费者分配不同消息 → 不重复消费
  消息需要 ACK 才算完成
  崩溃的消费者消息自动回到 pending → 其他消费者可以接管 (XCLAIM)
```

### 适用场景对比

| 场景 | 选择 | 原因 |
|------|------|------|
| 任务队列（需重试、确认） | BullMQ / Stream | 可靠性 |
| 实时通知（丢就丢了） | Pub/Sub | 轻量 |
| 事件溯源（回放历史） | Stream | 持久化 + ID 追溯 |
| 简单队列（无确认需求） | List | 最简单 |

### nest-search 为什么用 BullMQ 不用原生 Stream？

```
BullMQ 封装了:
  ✅ 自动重试 (attempts + backoff)
  ✅ 延迟任务
  ✅ 优先级队列
  ✅ 限流
  ✅ 任务状态追踪
  ✅ Dashboard UI

原生 Stream 需要自己实现以上所有 → 不值得

Stream 适合: 需要比 BullMQ 更灵活的场景
             或者轻量级消息队列（不想引入 BullMQ 依赖）
```

---

## §2. Pub/Sub（发布订阅）

```redis
# 订阅者 (客户端 A)
SUBSCRIBE channel:notifications

# 发布者 (客户端 B)
PUBLISH channel:notifications '{"type":"user_login","userId":42}'
```

### Pub/Sub vs Stream

| | Pub/Sub | Stream |
|---|---------|--------|
| 持久化 | ❌ 不存消息 | ✅ 消息持久化 |
| 离线消费 | ❌ 不在线就丢了 | ✅ 上线后可以补读 |
| 消费者组 | ❌ 无 | ✅ 有 |
| 确认机制 | ❌ 无 | ✅ ACK |
| 性能 | 更快（fire & forget） | 稍慢（需存储） |

### 适用场景

```
✅ 适合 Pub/Sub:
  - 实时通知 (在线用户数更新)
  - 配置变更广播 (所有实例刷新缓存)
  - 日志实时推送

❌ 不适合 Pub/Sub:
  - 不能丢消息的场景 (订单、支付)
  - 需要离线消费的场景
```

### nest-search 中 Pub/Sub 的应用

```ts
// 场景: 用户被禁用后,所有实例需要立即吊销该用户的 token
// 方案: 用 Pub/Sub 广播

// auth-service 实例 A (发布)
await redis.publish('auth:user_disabled', JSON.stringify({ userId: 42 }));

// auth-service 实例 B (订阅)
redis.subscribe('auth:user_disabled');
redis.on('message', (channel, message) => {
  const { userId } = JSON.parse(message);
  // 将该用户所有 token 加入黑名单
});
```

---

## §3. Pipeline（管道）

### 问题：逐条命令网络往返太多

```
逐条发送 (3 次网络往返):
  客户端 → SET key1 val1 → 服务端
  客户端 ← OK ← 服务端
  客户端 → SET key2 val2 → 服务端
  客户端 ← OK ← 服务端
  客户端 → SET key3 val3 → 服务端
  客户端 ← OK ← 服务端

Pipeline (1 次网络往返):
  客户端 → [SET key1 val1, SET key2 val2, SET key3 val3] → 服务端
  客户端 ← [OK, OK, OK] ← 服务端
```

### ioredis Pipeline 用法

```ts
const pipeline = redis.pipeline();
pipeline.set('key1', 'val1');
pipeline.set('key2', 'val2');
pipeline.set('key3', 'val3');
const results = await pipeline.exec();
// results = [[null, 'OK'], [null, 'OK'], [null, 'OK']]
```

### Pipeline vs 逐条 vs Lua

| | 逐条 | Pipeline | Lua (EVAL) |
|---|------|----------|------------|
| 网络往返 | N 次 | 1 次 | 1 次 |
| 原子性 | ❌ | ❌ | ✅ |
| 性能 | 最慢 | 快 | 快 |
| 适用场景 | 少量命令 | 批量写入 | 需要原子性 |

**注意**：Pipeline 不是原子的！命令只是打包发送，服务端还是逐条执行，中间可能插入其他客户端的命令。

---

## §4. 动手：扩展 RedisService

### Step 1 · 加 pipeline 方法

```ts
// apps/auth-service/src/redis/redis.service.ts

// 新增
pipeline() {
  return this.client.pipeline();
}
```

### Step 2 · 加 publish/subscribe 支持

```ts
// 新增
async publish(channel: string, message: string): Promise<number> {
  return this.client.publish(channel, message);
}
```

### Step 3 · 写性能基准测试

```ts
// apps/auth-service/src/redis/redis.bench.ts
// 对比: 逐条写入 vs Pipeline 批量写入
```

---

## §5. 内存优化技巧

### 5.1 Key 命名规范

```
❌ 坏: user, userdata, user_info, u
✅ 好: user:42, session:abc123, rate_limit:192.168.1.1

用冒号分隔层级,Redis 可视化工具 (RedisInsight) 能自动分组
```

### 5.2 设置 TTL（防止内存泄漏）

```
❌ 坏: SET key value (永远不过期)
✅ 好: SET key value EX 300 (5 分钟过期)

Redis 内存满了会 OOM,所有操作失败
```

### 5.3 避免大 Key

```
❌ 坏: SET huge_key "10MB 的 JSON"
  → 读取时阻塞 Redis 单线程很久
  → 网络传输慢

✅ 好: 拆成 Hash 的多个字段
  HSET data field1 "小值1"
  HSET data field2 "小值2"
  → 只读需要的字段
```

---

## §6. 监控：Redis INFO 命令

```redis
INFO memory
# used_memory: 1.5MB
# used_memory_peak: 2.1MB
# mem_fragmentation_ratio: 1.2

INFO stats
# total_connections_received: 100
# total_commands_processed: 50000
# instantaneous_ops_per_sec: 150

INFO clients
# connected_clients: 5
# blocked_clients: 0
```

### 关键指标

| 指标 | 含义 | 警戒线 |
|------|------|--------|
| `used_memory` | 当前内存 | 接近 maxmemory |
| `mem_fragmentation_ratio` | 内存碎片率 | > 1.5 需要关注 |
| `instantaneous_ops_per_sec` | QPS | 取决于硬件 |
| `connected_clients` | 连接数 | 接近 maxclients |
| `blocked_clients` | 阻塞的客户端 | > 0 说明有慢操作 |

---

## §7. Quiz

**Q1: Redis Stream 消费者组中，消息被 XREADGROUP 读取后，如何确认消费完成？**

A) 消息自动确认
B) 调用 XACK 命令
C) 消费者断开连接时自动确认

**Q2: Pipeline 和 Lua 脚本（EVAL）的关键区别是什么？**

A) Pipeline 更快
B) Pipeline 不是原子的，Lua 脚本是原子的
C) Lua 脚本不能操作多个 key

**Q3: Pub/Sub 消息不在线会怎样？**

A) 上线后自动补收
B) 存在 Redis 里等上线读取
C) 消息丢失，不在线就收不到

---

## §8. Commit Message

```
feat(auth-service): 0033 Redis 进阶 pipeline + benchmark

- RedisService 加 pipeline 方法
- 性能基准测试: 逐条写入 vs Pipeline 批量写入
- 21 测试还过
```

---

## §9. 跨节链接

- [0032 · 分布式锁 + Cache-Aside](./0032-redis-distributed-lock-cache.md) — 上一课
- [0034 · BullMQ 深度](./0034-bullmq-core.md) — 下一课（Phase B 第 4 课）
- [Redis 服务代码](../../apps/auth-service/src/redis/redis.service.ts) — nest-search 的 Redis 封装
