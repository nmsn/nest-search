# 0031 · Redis 数据结构：String/Hash/List/Sorted Set/Stream

> Phase B 第 1 课。Phase A 收官后进入 Redis 深度。nest-search 当前只用了 String (`get/set/del`)，本节讲 Redis 的 5 种核心数据结构及适用场景。

## 你今天会拿到什么

1. 掌握 **5 种 Redis 数据结构**：String / Hash / List / Sorted Set / Stream
2. 理解每种结构的**底层编码**和**性能特点**
3. 学会**选型**：什么场景用什么结构
4. 看懂 nest-search 当前用法 + 识别优化空间
5. 3 道 quiz

---

## §1. nest-search 现状

```
Redis 使用:
  auth-service: String (get/set/del) — token 存储 + 黑名单
  sync-service: BullMQ (底层用 List/Sorted Set) — 任务队列
  其他 service: 未使用

只用了 1/5 种数据结构,大量场景没覆盖:
  ❌ 用户 session 信息存在 token payload 里,不能动态更新
  ❌ 限流用的是内存 (ThrottlerModule),重启丢失
  ❌ 没有缓存层,每次查 DB
```

---

## §2. 五种数据结构

### 2.1 String（字符串）

```redis
SET key "value"
GET key           → "value"
SET key "value" EX 60    # 60 秒过期
INCR counter      → 1    # 原子自增
INCR counter      → 2
```

**底层编码**：`int`（数字）/ `embstr`（≤44 字节）/ `raw`（>44 字节）

**nest-search 用法**：
```
refresh_token:{uuid}     → '{"userId": 42}'
refresh_token_blacklist:{uuid} → '1'
at_blacklist:{jti}       → '1'
```

**适用场景**：缓存、计数器、分布式锁、简单的 key-value 存储

---

### 2.2 Hash（哈希）

```redis
HSET user:42 username "alice"
HSET user:42 role "admin"
HSET user:42 email "alice@example.com"

HGET user:42 username   → "alice"
HGETALL user:42         → { username: "alice", role: "admin", email: "..." }
HINCRBY user:42 loginCount 1   → 1
```

**底层编码**：`listpack`（小哈希）/ `hashtable`（大哈希）

**vs String 存 JSON**：
```
# String 方案
SET user:42 '{"username":"alice","role":"admin","email":"..."}'
# 读整个 → 改一个字段 → 写整个 (read-modify-write)

# Hash 方案
HSET user:42 username "alice" role "admin" email "..."
# 只读/改单个字段,不碰其他字段
```

**适用场景**：对象存储（用户信息、配置项）、只需要读写部分字段的场景

**nest-search 可优化**：
```ts
// 当前: refresh token 存 String
await redis.set(`refresh_token:${uuid}`, JSON.stringify({ userId }), ttl);

// 优化: 用 Hash 存更多字段
await redis.hset(`refresh_token:${uuid}`, {
  userId: String(userId),
  createdAt: String(Date.now()),
  ip: requestIp,
});
await redis.expire(`refresh_token:${uuid}`, ttl);
```

---

### 2.3 List（列表）

```redis
LPUSH queue "task1"     # 左边推入
LPUSH queue "task2"
RPOP queue              → "task1"  # 右边弹出 (FIFO)
BRPOP queue 30          → 阻塞等待,最长 30 秒
```

**底层编码**：`listpack`（小列表）/ `quicklist`（大列表）

**特点**：有序、可重复、FIFO 队列

**适用场景**：消息队列、最近列表、任务队列

**BullMQ 就是基于 List 实现的**：
```
bull:sync-full:wait     → List (等待中的 job)
bull:sync-full:active   → List (正在执行的 job)
bull:sync-full:completed → List (完成的 job)
```

---

### 2.4 Sorted Set（有序集合）

```redis
ZADD leaderboard 100 "alice"
ZADD leaderboard 85 "bob"
ZADD leaderboard 92 "charlie"

ZRANGE leaderboard 0 -1 WITHSCORES
→ [{ member: "bob", score: 85 }, { member: "charlie", score: 92 }, { member: "alice", score: 100 }]

ZREVRANGE leaderboard 0 2    # Top 3 (降序)
→ ["alice", "charlie", "bob"]

ZRANK leaderboard "alice"    # 排名 (升序)
→ 2

ZSCORE leaderboard "alice"   # 分数
→ 100
```

**底层编码**：`listpack`（小集合）/ `skiplist + hashtable`（大集合）

**特点**：每个 member 唯一，按 score 排序

**适用场景**：排行榜、延迟队列、时间窗口限流

**延迟队列示例**：
```ts
// 用 Sorted Set 实现延迟任务
ZADD delayed_jobs <execute_at_timestamp> '{"task":"sendEmail","to":"alice"}'

// Worker 轮询: 取出 score <= now 的任务
ZRANGEBYSCORE delayed_jobs 0 <now> LIMIT 0 10
```

---

### 2.5 Stream（流）

```redis
XADD mystream * name "alice" action "login"
→ "1687123456789-0"  (消息 ID)

XADD mystream * name "bob" action "purchase"
→ "1687123456790-0"

XRANGE mystream - +            # 读取所有消息
XREAD COUNT 10 BLOCK 5000 STREAMS mystream 0  # 阻塞读取
```

**底层编码**：`rax` (Radix Tree) + `listpack`

**特点**：持久化消息、消费者组、消息确认

**vs List 作为消息队列**：

| | List | Stream |
|---|------|--------|
| 消息确认 | ❌ POP 就没了 | ✅ ACK 机制 |
| 多消费者 | ❌ 竞争消费 | ✅ 消费者组 |
| 历史回溯 | ❌ 只能从头/尾 | ✅ 按 ID 范围查询 |
| 持久化 | 依赖 RDB/AOF | 自带 ID 追溯 |

**适用场景**：事件溯源、日志流、实时数据管道

---

## §3. 选型决策树

```
需要存什么？
├── 简单值 (字符串/数字/布尔) → String
├── 对象 (多个字段) → Hash
│   └── 字段少 (< 100) 且小 → Hash (listpack 编码,省内存)
│   └── 字段多或大 → 考虑 String JSON
├── 有序列表 (可重复) → List
│   └── 简单队列 → List (LPUSH + BRPOP)
│   └── 需要确认/回溯 → Stream
├── 排序集合 (不重复) → Sorted Set
│   └── 排行榜/延迟队列/时间窗口
└── 事件流 (持久化/消费者组) → Stream
```

---

## §4. 性能对比

| 操作 | String | Hash | List | Sorted Set | Stream |
|------|--------|------|------|------------|--------|
| 写入 | O(1) | O(1) | O(1) | O(log N) | O(1) |
| 读取 | O(1) | O(1) | O(1) | O(log N) | O(N) |
| 范围查询 | ❌ | ❌ | O(N) | O(log N + M) | O(N) |
| 内存效率 | 中 | 高(小对象) | 中 | 低 | 高 |

---

## §5. Quiz

**Q1: 存储用户信息（username, role, email），用哪种结构最合适？**

A) String (JSON)
B) Hash
C) Sorted Set

**Q2: 实现排行榜（按分数排序，取 Top 10），用哪种结构？**

A) List
B) Hash
C) Sorted Set

**Q3: BullMQ 任务队列底层用的是 Redis 的哪种结构？**

A) String
B) List
C) Stream

---

## §6. Commit Message

```
docs(teaching): 0031 Redis 数据结构 lesson
```

---

## §7. 跨节链接

- [0030 · CORS + 安全头](./0030-cors-security-headers.md) — 上一课 (Phase A 收官)
- [0032 · 分布式锁 + Cache-Aside](./0032-redis-distributed-lock-cache.md) — 下一课
- [Redis 服务代码](../../apps/auth-service/src/redis/redis.service.ts) — nest-search 的 Redis 封装
