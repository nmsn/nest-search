# 0064 · 缓存策略：Cache-Aside + 三大坑

> Phase E 第 3 课。nest-search 已在 0032 实现 `UserService.findById` Cache-Aside，本节**完整化** + 处理三大坑（穿透 / 雪崩 / 击穿）。

## 你今天会拿到什么

1. 理解 **3 种缓存模式**（Cache-Aside / Write-Through / Write-Behind）
2. 理解 **3 大坑**（穿透 / 雪崩 / 击穿）
3. nest-search 加 **CacheService 通用封装**
4. 实战处理 3 大坑
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
已实现 (0032):
  - UserService.findById 用 Cache-Aside
  - Redis 缓存 user
  - 5 分钟 TTL

未实现 (企业级):
  ❌ 没有通用 CacheService (各业务自己写)
  ❌ 没有穿透防护 (恶意请求不存在的 ID)
  ❌ 没有雪崩防护 (Redis 挂了 / 大 key 过期)
  ❌ 没有击穿防护 (热点 key 过期瞬间)
  ❌ 没有 Cache 监控
```

### 1.2 真实生产场景

```
场景 1: 恶意查询
  GET /api/products/99999 (不存在的)
  每次都查 DB (cache miss)
  → DB 压力爆
  → 缓存穿透

场景 2: 热点商品过期
  双 11 某商品缓存到期
  瞬间 1 万请求打 DB
  → 雪崩

场景 3: 多个 worker 同时查
  worker A 查 cache miss → 查 DB → 写 cache
  worker B 同时也查 cache miss → 查 DB → 写 cache
  → 击穿
```

---

## §2. 3 种缓存模式

### 2.1 Cache-Aside (推荐 80% 场景)

```
时序:
  读:
    1. 查 cache
    2. hit → 返回
    3. miss → 查 DB
    4. 写 cache (TTL)
    5. 返回数据

  写:
    1. 写 DB
    2. 删 cache (不是更新!)

适合:
  ✅ nest-search 通用
  ✅ 简单
  ✅ 灵活
```

### 2.2 Write-Through

```
时序:
  写:
    1. 写 cache
    2. cache 同步写 DB
  读:
    1. 查 cache
    2. 一定 hit

适合:
  - 数据强一致
  - 写入少
  - nest-search 不用
```

### 2.3 Write-Behind (异步写)

```
时序:
  写:
    1. 写 cache
    2. 异步批量写 DB (后台)
  读:
    1. 查 cache

适合:
  - 写入频繁
  - 性能要求高
  - 允许短暂不一致
  - nest-search 不用 (太复杂)
```

---

## §3. 3 大坑

### 3.1 缓存穿透 (Cache Penetration)

```
现象:
  查不存在的 key (如 user_id=99999)
  cache miss → 查 DB → DB 没
  → 每次都查 DB
  → 恶意请求打爆 DB

解决:
  ✅ 缓存空值: SET user:99999 "" EX 60
     → 60 秒内同请求走 cache (空值)
  ✅ 布隆过滤器: 不存在的 key 提前拦截
```

### 3.2 缓存雪崩 (Cache Avalanche)

```
现象:
  大量 key 同时过期
  瞬间所有请求打 DB
  → DB 撑不住, 雪崩

解决:
  ✅ 过期时间加随机: TTL ± 10%
  ✅ 多级缓存: Redis + 本地缓存
  ✅ 后台预热: 提前刷新 key
```

### 3.3 缓存击穿 (Cache Breakdown)

```
现象:
  某个热点 key 过期
  瞬间 1 万请求查这个 key
  → 都 miss, 都打 DB
  → 击穿

解决:
  ✅ 互斥锁: 只让一个 worker 查 DB
     SET key:lock "1" EX 5 NX
     → 其他 worker 等
  ✅ 后台异步刷新: 后台进程提前查 DB
```

### 3.4 对比

| 坑 | 场景 | 解决 |
|------|------|------|
| **穿透** | 查不存在的数据 | 空值缓存 / 布隆 |
| **雪崩** | 大量 key 同时过期 | 随机 TTL / 多级缓存 |
| **击穿** | 热点 key 过期瞬间高并发 | 互斥锁 / 异步刷新 |

---

## §4. nest-search 通用 CacheService

### 4.1 封装目的

```
现在:
  UserService.findById 自己写 cache 逻辑
  ProductService 自己也写
  → 复制 100 次, 易错

通用 CacheService:
  - 一次封装
  - 业务方调用
  - 自动处理 3 大坑
```

### 4.2 CacheService 设计

```ts
// apps/auth-service/src/cache/cache.service.ts
@Injectable()
export class CacheService {
  constructor(private redis: RedisService) {}

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T | null>,
    options?: {
      ttl?: number;          // 秒
      nullTtl?: number;      // 空值 TTL
      enableLock?: boolean;   // 击穿防护
    },
  ): Promise<T | null> {
    const ttl = options?.ttl || 300;
    const nullTtl = options?.nullTtl || 60;

    // 1. 查 cache
    const cached = await this.redis.get(key);
    
    // 2. 空值缓存 (穿透防护)
    if (cached === '__NULL__') return null;
    if (cached) return JSON.parse(cached) as T;

    // 3. 击穿防护 (互斥锁)
    if (options?.enableLock) {
      const lockKey = `${key}:lock`;
      const got = await this.redis.set(lockKey, '1', 'EX', 5, 'NX');
      if (!got) {
        // 没拿到锁, 等 100ms 再试
        await new Promise(r => setTimeout(r, 100));
        return this.getOrSet(key, fetcher, options);
      }
    }

    // 4. 查 DB
    const data = await fetcher();
    
    // 5. 写 cache (空值也缓存)
    if (data === null || data === undefined) {
      await this.redis.set(key, '__NULL__', nullTtl);
    } else {
      // 雪崩防护: 随机 ± 10%
      const randomTtl = ttl + Math.floor(Math.random() * 60 - 30);
      await this.redis.set(key, JSON.stringify(data), Math.max(60, randomTtl));
    }
    
    return data;
  }

  // 删除 cache
  async invalidate(key: string) {
    await this.redis.del(key);
  }
}
```

### 4.3 业务方使用

```ts
// user.service.ts
@Injectable()
export class UserService {
  constructor(
    private db: DrizzleService,
    private cache: CacheService,
  ) {}

  async findById(id: number) {
    return this.cache.getOrSet(
      `user:${id}`,
      () => this.db.query.users.findFirst({ where: eq(users.id, id) }),
      { ttl: 300, enableLock: true }
    );
  }

  async create(dto) {
    // 写 DB
    const user = await this.db.insert(users).values(...);
    // 失效 cache
    await this.cache.invalidate(`user:${user.id}`);
    return user;
  }
}
```

---

## §5. nest-search 实战

### 5.1 改造路径

```
最小 (1 小时):
  1. 创建 CacheService
  2. UserService 用 CacheService 替换自己写的
  3. 21 测试验证

完整 (2-3 小时):
  1. 上面
  2. ProductService 用
  3. SyncService 用
  4. 加监控 (cache 命中率)
```

### 5.2 监控

```ts
// CacheService 加埋点
@Injectable()
export class CacheService {
  private hitCount = 0;
  private missCount = 0;

  async getOrSet<T>(...) {
    const cached = await this.redis.get(key);
    if (cached) {
      this.hitCount++;
      return JSON.parse(cached);
    }
    this.missCount++;
    // ...
  }

  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      hitRate: total > 0 ? this.hitCount / total : 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }
}
```

接 Prometheus 后, 业务方能在 Grafana 看:
- cache 命中率
- miss 趋势
- 单 key 延迟

---

## §6. 完整 Cache-Aside vs nest-search 现状

| 维度 | nest-search 现状 | 0064 改造后 |
|------|------------------|-------------|
| 通用封装 | ❌ 重复 3 次 | ✅ 一次封装 |
| 穿透防护 | ❌ 查不存在数据打 DB | ✅ 空值缓存 |
| 雪崩防护 | ❌ 固定 5min | ✅ 随机 TTL |
| 击穿防护 | ❌ 高并发过期打 DB | ✅ 互斥锁 |
| 监控 | ❌ 无 | ✅ hit rate |

---

## §7. Quiz

**Q1: 缓存穿透的解决方案？**

A) 缓存空值
B) 随机 TTL
C) 互斥锁

**Q2: 雪崩的根因？**

A) 大量 key 同时过期
B) 查不存在数据
C) 热点 key 过期

**Q3: nest-search 适合什么缓存模式？**

A) Cache-Aside
B) Write-Through
C) Write-Behind

---

## §8. Commit Message

```
feat(shared): 0064 缓存策略 + CacheService

- apps/auth-service/src/cache/cache.service.ts: 通用封装
  - getOrSet: 一行调用, 自动处理 3 大坑
  - 穿透: 空值缓存
  - 雪崩: 随机 TTL
  - 击穿: 互斥锁
- user.service.ts: 切换到 CacheService
- 21 测试还过
```

---

## §9. 跨节链接

- [0063 · 高并发池](./0063-high-concurrency-pool.md) — 上一课
- [0065 · 分库分表](./0065-sharding-snowflake.md) — 下一课
- [cache.service.ts](../../apps/auth-service/src/cache/cache.service.ts) — 核心实现
