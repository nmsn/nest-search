# 0034 · BullMQ 核心：Queue / Worker / Job

> Phase B 第 4 课。BullMQ 深度 3 节的第 1 节。nest-search 的 sync-service 已经在用 BullMQ（`@nestjs/bullmq`），本节**拆解现有代码**，讲清核心概念。

## 你今天会拿到什么

1. 理解 **Queue / Worker / Job 三角关系**
2. 理解 **Job 生命周期**：waiting → active → completed / failed
3. 理解 **重试策略**：attempts + backoff
4. 理解 **延迟任务**和**优先级队列**
5. 3 道 quiz

---

## §1. nest-search 现状

```
sync-service 已有:
  Queue:     sync-full, sync-incremental
  Producer:  SyncService.triggerFullSync() / triggerIncrementalSync()
  Worker:    SyncFullConsumer, SyncIncrementalConsumer
  重试:      3 次,指数退避 (1s, 2s, 4s)

没讲过的:
  ❌ 为什么这样设计?
  ❌ Job 生命周期是什么?
  ❌ 还有哪些配置项没用到?
```

---

## §2. Queue / Worker / Job 三角关系

```
┌──────────┐    add()     ┌──────────┐   process    ┌──────────┐
│ Producer │ ──────────→  │  Queue   │ ──────────→  │  Worker  │
│ (Service)│              │ (Redis)  │              │(Consumer)│
└──────────┘              └──────────┘              └──────────┘
                               │                         │
                               │    Job 对象              │
                               │  ┌─────────────┐        │
                               └─→│ id, data,   │←───────┘
                                  │ status,     │
                                  │ attemptsMade│
                                  └─────────────┘
```

### 三者职责

| 角色 | 职责 | nest-search 对应 |
|------|------|-------------------|
| **Queue** | 存储 Job，持久化到 Redis | `sync-full`, `sync-incremental` |
| **Producer** | 往 Queue 里添加 Job | `SyncService.triggerFullSync()` |
| **Worker** | 从 Queue 取 Job 并执行 | `SyncFullConsumer.handleFullSync()` |

### 关键理解

```
Queue 在 Redis 里,不在内存里:
  → 服务重启,未完成的 Job 不会丢
  → 多个实例可以连同一个 Queue (水平扩展)

Worker 是独立进程:
  → Worker 崩溃不影响 Queue
  → Job 会重新回到 waiting 状态 (如果配置了重试)
```

---

## §3. Job 生命周期

```
                    add()
                     │
                     ▼
               ┌──────────┐
               │ waiting  │  ← 排队中
               └────┬─────┘
                    │ Worker 取走
                    ▼
               ┌──────────┐
               │  active  │  ← 正在执行
               └────┬─────┘
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │completed │ │  failed  │ │ delayed  │
    │ 成功 ✅  │ │ 失败 ❌  │ │ 延迟 ⏰  │
    └──────────┘ └────┬─────┘ └──────────┘
                      │
                attempts < max?
                 ├─ 是 → 回到 waiting (重试)
                 └─ 否 → 保持 failed
```

### 查看 Job 状态

```ts
const job = await queue.getJob(jobId);
console.log(job.status());      // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
console.log(job.attemptsMade);  // 已重试次数
console.log(job.returnvalue);   // Worker 返回值
console.log(job.failedReason);  // 失败原因
```

---

## §4. 重试策略（attempts + backoff）

### nest-search 当前配置

```ts
// sync.service.ts
await this.fullQueue.add('sync', data, {
  attempts: 3,                                    // 最多重试 3 次
  backoff: { type: 'exponential', delay: 1000 },  // 指数退避,初始 1 秒
});
```

### 重试时间线

```
第 1 次执行: 立即
  ↓ 失败
第 2 次执行: 等 1 秒后 (delay: 1000)
  ↓ 失败
第 3 次执行: 等 2 秒后 (1000 × 2¹)
  ↓ 失败
标记为 failed,不再重试
```

### backoff 类型

| 类型 | 公式 | delay=1000 时的等待 |
|------|------|---------------------|
| `fixed` | delay | 1s, 1s, 1s |
| `exponential` | delay × 2^(attempt-1) | 1s, 2s, 4s |

### 自定义 backoff

```ts
// 自定义: 根据失败原因决定是否重试
backoff: {
  type: 'custom',
  delay: 1000,
},
// 然后在 Worker 里:
// Job 里抛出的错误如果有 .retryable = false,则不重试
```

---

## §5. 延迟任务（Delayed Jobs）

```ts
// 5 分钟后执行
await queue.add('send-email', { to: 'alice@example.com' }, {
  delay: 5 * 60 * 1000,  // 5 分钟 (毫秒)
});

// 或者指定绝对时间
await queue.add('report', {}, {
  delay: new Date('2026-06-27T09:00:00').getTime() - Date.now(),
});
```

### 延迟任务原理

```
add() with delay
     │
     ▼
┌──────────┐
│ delayed  │  ← 存在 Redis Sorted Set 里,score = 执行时间戳
└────┬─────┘
     │ 时间到了
     ▼
┌──────────┐
│ waiting  │  ← 自动移到 waiting 队列
└──────────┘
```

---

## §6. 优先级队列

```ts
// 默认: FIFO (先进先出)
await queue.add('task', data);

// 加优先级: 数字越小,优先级越高
await queue.add('urgent-task', data, { priority: 1 });
await queue.add('normal-task', data, { priority: 10 });
await queue.add('low-task', data, { priority: 20 });

// Worker 会先处理 priority=1 的任务
```

### 适用场景

```
✅ 适合优先级:
  - 用户请求 > 后台任务
  - 付费用户 > 免费用户
  - 实时同步 > 定时同步

❌ 不适合优先级:
  - 所有任务同等重要 → 默认 FIFO 就好
  - 优先级太多 → 维护复杂
```

---

## §7. 事件监听

```ts
// Queue 级别事件
queue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

queue.on('failed', (job, err) => {
  console.log(`Job ${job.id} failed:`, err.message);
});

queue.on('stalled', (jobId) => {
  console.log(`Job ${jobId} stalled (Worker 可能崩溃了)`);
});
```

### nest-search 可以加的监听

```ts
// 在 SyncService.onModuleInit() 里
this.fullQueue.on('completed', (job) => {
  this.logger.log(`Sync job ${job.id} completed for ${job.data.businessLine}`);
});

this.fullQueue.on('failed', (job, err) => {
  this.logger.error(`Sync job ${job.id} failed: ${err.message}`);
});
```

---

## §8. 设计决策

### 决策 1 · 为什么用两个 Queue 而不是一个？

```
方案 A: 一个 queue,用 data.type 区分
  Worker 需要 if/else 判断类型
  全量和增量互相阻塞

方案 B: 两个 queue (当前方案) ✅
  各自独立 Worker,互不影响
  可以分别配置并发数
  代码更清晰
```

### 决策 2 · 为什么 3 次重试 + 指数退避？

```
3 次: 大多数瞬时故障 (网络抖动/ES 短暂过载) 3 次内能恢复
指数退避: 避免立即重试加重故障 (打满 ES)
1s 起步: 给 ES 足够恢复时间,又不会等太久
```

---

## §9. Quiz

**Q1: Bull Job 的生命周期是什么顺序？**

A) active → waiting → completed
B) waiting → active → completed 或 failed
C) created → processing → done

**Q2: `attempts: 3, backoff: { type: 'exponential', delay: 1000 }` 第 3 次重试要等多久？**

A) 1 秒
B) 2 秒
C) 4 秒

**Q3: 为什么 nest-search 用两个 Queue（sync-full 和 sync-incremental）而不是一个？**

A) 因为 Bull 不支持一个 Queue 存不同类型的 Job
B) 为了让全量和增量互不影响，可以分别配置并发
C) 因为 Redis 存储限制

---

## §10. Commit Message

```
docs(teaching): 0034 BullMQ 核心 lesson
```

---

## §11. 跨节链接

- [0033 · Redis 进阶](./0033-redis-advanced.md) — 上一课
- [0035 · BullMQ 进阶](./0035-bullmq-advanced.md) — 下一课（重试 + 延迟 + 优先级实战）
- [sync.service.ts](../../apps/sync-service/src/sync/sync.service.ts) — Producer
- [sync.consumer.ts](../../apps/sync-service/src/sync/sync.consumer.ts) — Worker
