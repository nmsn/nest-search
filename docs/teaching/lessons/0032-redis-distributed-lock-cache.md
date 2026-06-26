# 0032 · 分布式锁 + Cache-Aside 模式

> Phase B 第 2 课。0031 讲了数据结构,0032 动手：**分布式锁**（防止并发冲突）+ **Cache-Aside**（减少 DB 查询）。

## 你今天会拿到什么

1. 理解 **为什么需要分布式锁**（单机锁在多实例下失效）
2. 亲手实现 **Redis 分布式锁**（SET NX EX）
3. 理解 **Cache-Aside 模式**（读缓存 → miss → 查 DB → 写缓存）
4. 给 `UserService.findById` 加 Cache-Aside
5. 21 测试还过 + 1 个 commit

---

## §1. 为什么需要分布式锁

```
单机锁 (Node.js):
  进程 A: acquireLock() → 操作 → releaseLock()
  只在一个进程内有效

分布式环境:
  实例 1: acquireLock() → 操作共享资源
  实例 2: acquireLock() → 也想操作同一个资源
  → 竞态条件,数据不一致

分布式锁:
  实例 1: SET lock:resource "id" NX EX 30 → 拿到锁 → 操作 → DEL lock:resource
  实例 2: SET lock:resource "id" NX EX 30 → 拿不到 → 等待/失败
```

---

## §2. Redis 分布式锁实现

### 基本原理

```redis
SET lock:my-resource "owner-uuid" NX EX 30
```

| 参数 | 含义 |
|------|------|
| `NX` | 只在 key 不存在时才设置（互斥） |
| `EX 30` | 30 秒后自动过期（防死锁） |
| `value` | 唯一标识（释放时验证 owner） |

### 释放锁（Lua 脚本保证原子性）

```ts
// 不能直接 DEL，要先检查是不是自己加的锁
// 用 Lua 脚本保证原子性
const RELEASE_LOCK = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;
```

**为什么用 Lua？**

```
❌ 非原子操作:
  1. GET lock:resource → "my-id"
  2. (此时锁过期了,别人拿到锁)
  3. DEL lock:resource → 删了别人的锁!

✅ Lua 脚本:
  GET + 比较 + DEL 在一个原子操作里完成
```

---

## §3. Cache-Aside 模式

```
读请求:
  1. 查缓存 (Redis)
  2. 命中 → 返回
  3. 未命中 → 查 DB → 写缓存 → 返回

写请求:
  1. 更新 DB
  2. 删除缓存 (不是更新缓存!)
  3. 下次读时重新加载

为什么删缓存而不是更新缓存?
  - 更新缓存可能有并发问题 (A 先写,B 后写,但 A 的缓存更新晚于 B)
  - 删除缓存更简单,下次读时自然重建
```

### 流程图

```
GET /api/users/42
    ↓
┌──────────────┐
│ Redis GET    │
│ user:42      │
└──────┬───────┘
       ↓
   命中? ──是──→ 返回缓存数据
       │
       否
       ↓
┌──────────────┐
│ DB SELECT    │
│ WHERE id=42  │
└──────┬───────┘
       ↓
┌──────────────┐
│ Redis SET    │
│ user:42 data │
│ TTL 5min     │
└──────┬───────┘
       ↓
     返回
```

---

## §4. 设计决策

### 决策 1 · 缓存 key 命名

```ts
// 方案 A: 直接用 ID
`user:42`

// 方案 B: 加业务前缀 + 版本
`auth:user:42:v1`
```

**选 A**。理由：简单清晰，nest-search 只有一个 service 缓存用户。

### 决策 2 · TTL 设多少？

```ts
// 太短: 缓存命中率低,频繁查 DB
// 太长: 数据更新后缓存不一致

// 方案: 5 分钟
// 理由: 用户信息变化不频繁,5 分钟内不一致可接受
```

### 决策 3 · 缓存穿透怎么处理？

```
缓存穿透: 查询不存在的数据,每次都查 DB
  GET user:99999 → miss → DB: null → 不缓存 → 下次还查 DB

解决: 缓存空值
  GET user:99999 → miss → DB: null → SET user:99999 "" EX 60
  下次 GET user:99999 → 命中空值 → 直接返回 null
```

---

## §5. 动手：扩展 RedisService

### Step 1 · 加 Hash + Lua 脚本支持

```ts
// apps/auth-service/src/redis/redis.service.ts

// 新增方法
async setnx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

async eval(script: string, keys: string[], args: string[]): Promise<any> {
  return this.client.eval(script, keys.length, ...keys, ...args);
}
```

### Step 2 · 创建分布式锁 utility

```ts
// apps/auth-service/src/common/distributed-lock.ts
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';

export class DistributedLock {
  private readonly lockId: string;

  constructor(
    private readonly redis: RedisService,
    private readonly key: string,
    private readonly ttlSeconds: number = 30,
  ) {
    this.lockId = randomUUID();
  }

  async acquire(): Promise<boolean> {
    return this.redis.setnx(`lock:${this.key}`, this.lockId, this.ttlSeconds);
  }

  async release(): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, [`lock:${this.key}`], [this.lockId]);
    return result === 1;
  }
}
```

### Step 3 · UserService 加 Cache-Aside

```ts
// apps/auth-service/src/user/user.service.ts
async findById(id: number) {
  // 1. 查缓存
  const cached = await this.redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  // 2. 查 DB
  const [result] = await this.drizzle.db
    .select().from(users).where(eq(users.id, id)).limit(1);
  if (!result) {
    // 缓存空值(防穿透)
    await this.redis.set(`user:${id}`, '', 60);
    throw new UserNotFoundException(id);
  }

  // 3. 写缓存
  await this.redis.set(`user:${id}`, JSON.stringify(result), 300); // 5min
  return result;
}
```

---

## §6. Quiz

**Q1: 分布式锁为什么要设置过期时间？**

A) 为了性能更好
B) 防止死锁 — 持有锁的进程崩溃后锁自动释放
C) 为了节省内存

**Q2: 释放锁时为什么要用 Lua 脚本？**

A) 因为 Lua 比 JavaScript 快
B) 为了保证"检查 owner + 删除"是原子操作，避免删掉别人的锁
C) 因为 Redis 不支持 DEL 命令

**Q3: Cache-Aside 写操作为什么是"删缓存"而不是"更新缓存"？**

A) 因为删比更新快
B) 因为更新缓存可能有并发问题，删除更简单，下次读时自然重建
C) 因为 Redis 不支持更新操作

---

## §7. Commit Message

```
feat(auth-service): 0032 分布式锁 + Cache-Aside

- RedisService 加 setnx + eval 方法
- 新增 DistributedLock utility (SET NX EX + Lua 释放)
- UserService.findById 加 Cache-Aside (Redis 5min TTL)
- 缓存空值防穿透
- 21 测试还过
```

---

## §8. 跨节链接

- [0031 · Redis 数据结构](./0031-redis-data-structures.md) — 上一课
- [0033 · Redis 进阶](./0033-redis-advanced.md) — 下一课
