# 0048 · 错误处理模式：指数退避 + 熔断器 + 隔离

> Phase B 收官之 1。生产环境系统总会失败：网络超时、服务宕机、限流。本节讲**三大错误处理模式**。

## 你今天会拿到什么

1. 理解 **指数退避重试**（exponential backoff）
2. 理解 **熔断器**（circuit breaker）原理
3. 理解 **隔离**（bulkhead）模式
4. 学会 nest-search 加 retry decorator（演示用）
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 失败场景

```
场景 1: 调 ES 偶尔超时
  10 次请求有 1 次超时
  → 立刻重试 + 网络抖动用 exponential backoff

场景 2: ES 集群挂了一段时间
  持续 5 分钟所有请求失败
  → 重试没用（一直失败）
  → 熔断器打开，快速失败，保护下游

场景 3: 一个服务调用挂了
  拖垮整个 NestJS
  → 隔离模式：限制并发，避免资源耗尽
```

### 1.2 nest-search 的失败点

```
sync-service → ES bulk write
  - 偶发网络超时 → retry
  - ES 集群过载 → circuit breaker
  - 多个 product 同步并发 → bulkhead

search-service → ES search
  - 慢查询 → timeout + retry
  - ES 过载 → circuit breaker

auth-service → PG
  - 连接池满 → bulkhead (限流)
```

---

## §2. 指数退避重试

### 2.1 朴素重试的问题

```
朴素: 失败立即重试,无限重试
  → 拖垮下游服务（雪崩）
  → 用户长时间等待

例: ES 过载时
  1000 个请求同时失败
  1000 个重试同时打 ES
  → ES 更过载 → 更多失败 → 更多重试 → 雪崩
```

### 2.2 指数退避

```
第 1 次: 立即重试
第 2 次: 失败后等 1s 重试
第 3 次: 失败后等 2s 重试
第 4 次: 失败后等 4s 重试
第 N 次: 失败后等 2^N * 1s（加 jitter 随机）
超过 maxRetries: 抛出错误
```

公式：`delay = min(maxDelay, baseDelay * 2^attempt) + jitter`

### 2.3 NestJS 实现

```ts
// apps/shared/src/utils/retry.ts
export interface RetryOptions {
  maxRetries?: number;       // 默认 3
  baseDelay?: number;        // 默认 1000ms
  maxDelay?: number;         // 默认 30000ms
  retryableErrors?: (err: any) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    retryableErrors = () => true,
  } = opts;

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !retryableErrors(err)) {
        throw err;
      }
      // 指数退避 + jitter
      const delay = Math.min(
        maxDelay,
        baseDelay * Math.pow(2, attempt),
      ) + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
```

### 2.4 使用

```ts
// sync.consumer.ts
import { retry } from '../../../shared/src/utils/retry';

await retry(
  () => this.esClient.bulk({ operations }),
  {
    maxRetries: 3,
    baseDelay: 1000,
    retryableErrors: (err) => err.code !== 'INDEX_NOT_FOUND',
  },
);
```

---

## §3. 熔断器（Circuit Breaker）

### 3.1 原理

```
熔断器 3 个状态:

  CLOSED (关闭)     → 正常调用
  ↓ 失败率高
  OPEN (打开)       → 快速失败（不调下游）
  ↓ 等冷却时间
  HALF_OPEN (半开)  → 试探性调一次
    ↓ 成功 → CLOSED
    ↓ 失败 → OPEN
```

```
时序图:

  1. 正常调用（CLOSED）
  2. 失败 N 次
  3. 打开熔断（OPEN）→ 直接返回错误
  4. 等 30s
  5. 半开（HALF_OPEN）→ 试探调 1 次
  6a. 成功 → 关熔断（CLOSED），恢复
  6b. 失败 → 重新打开（OPEN）
```

### 3.2 关键参数

| 参数 | 默认 | 含义 |
|------|------|------|
| `failureThreshold` | 5 | 连续失败 N 次触发熔断 |
| `resetTimeout` | 30000 | 熔断后等多久尝试半开 |
| `monitorInterval` | 1000 | 多久统计一次失败率 |

### 3.3 NestJS 实现

```ts
// apps/shared/src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 30000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN'; // 试探
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }
}
```

### 3.4 实际使用

```ts
// ES service wrapper
const breaker = new CircuitBreaker(5, 30000);

const result = await breaker.execute(() => 
  this.client.search({ index, body })
);
```

---

## §4. 隔离（Bulkhead）

### 4.1 原理

```
隔离: 把不同业务的资源分开,一个业务的失败不影响其他

例: sync-service 有 3 个 consumer
  - sync-full  (ES bulk write)
  - sync-incremental
  - future (第三方 API)

不隔离:
  full 写 ES 卡住 → 占满 worker → incremental 跟着卡

隔离:
  full 用 5 个 worker
  incremental 用 3 个 worker
  full 卡住不影响 incremental
```

### 4.2 实现方式

| 方式 | 适用 | 复杂度 |
|------|------|--------|
| 线程池 | 传统 Java | 高 |
| 信号量（Semaphore）| 通用 | 中 |
| BullMQ concurrency | nest-search | ✅ 已有 |

### 4.3 nest-search 用 BullMQ concurrency

```ts
// sync.consumer.ts - 已有
@Processor('sync-full', { limiter: { max: 5, duration: 1000 } })
export class SyncFullConsumer extends WorkerHost {
  // max: 5 → 最多 5 个并发 job
}
```

**这就是 bulkhead**。两个 queue 各自有独立并发上限，互不影响。

---

## §5. 三种模式如何组合

```
┌─────────────────────────────────────┐
│  Bulkhead (限流,防止资源耗尽)         │  ← 最外层
│  max 5 个并发                         │
└──────────┬──────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  Circuit Breaker (熔断,防止雪崩)       │  ← 中间层
│  失败 5 次 → 打开 → 等 30s → 半开     │
└──────────┬──────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  Retry (重试,处理瞬时失败)             │  ← 最内层
│  指数退避 1s/2s/4s                     │
└──────────┬──────────────────────────┘
           ↓
       实际业务调用 (ES / PG / 第三方 API)
```

**执行流**：
1. 请求先过 bulkhead（限流）
2. 再过熔断器（失败 N 次就快速失败）
3. 最后重试逻辑（瞬时失败重试）

---

## §6. nest-search 改造

### 6.1 加 retry utility

```ts
// apps/shared/src/utils/retry.ts
// （见上面 2.3）
```

### 6.2 sync.consumer.ts 用 retry

```ts
// sync.consumer.ts
import { retry } from '@app/shared/utils/retry';

await retry(
  () => this.esClient.bulk({ operations }),
  { maxRetries: 3, baseDelay: 1000 }
);
```

### 6.3 CircuitBreaker（演示用，不集成）

```ts
// apps/shared/src/utils/circuit-breaker.ts
// 单独文件,使用时 wrap 业务调用
```

---

## §7. 设计决策

### 决策 1 · retryableErrors 怎么判断？

```
✅ 重试:
  - network timeout
  - 503 service unavailable
  - 429 too many requests

❌ 不重试:
  - 400 bad request (参数错,重试也错)
  - 401 unauthorized (无权限,重试也错)
  - 404 not found
```

### 决策 2 · 熔断阈值多少？

```
按业务:
  关键服务: 阈值低（3-5 次就熔断）
  非关键: 阈值高（10-20 次）

nest-search:
  - ES bulk write: 阈值 5（重试无效就熔断）
  - ES search: 阈值 10（搜索可降级）
```

### 决策 3 · 隔离粒度？

```
粗粒度: 整个进程一个连接池
细粒度: 每个 service / 每个 endpoint 独立池
```

---

## §8. Quiz

**Q1: 指数退避的目的是什么？**

A) 减少重试次数
B) 避免雪崩（失败后等更长时间再重试，给下游恢复时间）
C) 提高响应速度

**Q2: 熔断器 OPEN 状态会怎样？**

A) 正常调用
B) 快速失败，不调下游
C) 重试

**Q3: nest-search 的 bulkhead 已经用哪个技术实现了？**

A) 信号量
B) BullMQ concurrency
C) 线程池

---

## §9. Commit Message

```
feat(shared): 0048 错误处理模式 - retry + circuit breaker

- apps/shared/src/utils/retry.ts: 指数退避重试
- apps/shared/src/utils/circuit-breaker.ts: 熔断器实现
- 21 测试还过
```

---

## §10. 跨节链接

- [0047 · 高亮 + Suggest](./0047-elasticsearch-highlight-suggest.md) — 上一课
- [0049 · 错误处理实战](./0049-error-handling-practice.md) — 下一课
- [docs/teaching/CURRICULUM.md](../../CURRICULUM.md) — 整体课表
