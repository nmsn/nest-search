# 0035 · BullMQ 进阶：事件监听 + Job 监控 + 延迟任务

> Phase B 第 5 课。0034 讲理论，0035 动手：给 sync-service 加 **事件监听** + **Job 状态查询** + **延迟任务演示**。

## 你今天会拿到什么

1. 给 sync-service 加 **事件监听**（completed / failed / stalled）
2. 加 **Job 状态查询** endpoint（GET /api/sync/jobs/:id）
3. 加 **延迟任务** endpoint（POST /api/sync/delayed）
4. 理解 **限流**（Rate Limiter）在 BullMQ 中的用法
5. 21 测试还过 + 1 个 commit

---

## §1. 事件监听

### 为什么需要事件监听？

```
当前问题:
  Job 完成/失败后,没有任何通知
  只能在 Worker 的日志里看到结果
  没有集中的监控方式

解决:
  Queue 级别事件监听,统一处理
```

### 加到 SyncService

```ts
// sync.service.ts — onModuleInit() 里
async onModuleInit() {
  // 全量同步事件
  this.fullQueue.on('completed', (job) => {
    this.logger.log(`[sync-full] Job ${job.id} completed: ${job.data.businessLine}`);
  });

  this.fullQueue.on('failed', (job, err) => {
    this.logger.error(`[sync-full] Job ${job.id} failed: ${err.message}`);
  });

  this.fullQueue.on('stalled', (jobId) => {
    this.logger.warn(`[sync-full] Job ${jobId} stalled`);
  });

  // 增量同步事件
  this.incrementalQueue.on('completed', (job) => {
    this.logger.log(`[sync-incr] Job ${job.id} completed: ${job.data.businessLine}`);
  });

  this.incrementalQueue.on('failed', (job, err) => {
    this.logger.error(`[sync-incr] Job ${job.id} failed: ${err.message}`);
  });

  this.logger.log('BullMQ event listeners registered');
}
```

---

## §2. Job 状态查询

### 当前问题

```
POST /api/sync/full/electronics → 返回 { jobId: "5" }
然后呢? 不知道 Job 成功还是失败了
```

### 加 Job 状态 endpoint

```ts
// sync.controller.ts
@Get('jobs/:id')
async getJobStatus(@Param('id') jobId: string) {
  // 在两个 queue 里找
  const job = await this.syncService.findJob(jobId);
  if (!job) throw new NotFoundException(`Job ${jobId} not found`);

  return {
    id: job.id,
    status: await job.getState(),     // waiting | active | completed | failed | delayed
    data: job.data,
    attemptsMade: job.attemptsMade,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
  };
}
```

### SyncService 加 findJob

```ts
async findJob(jobId: string) {
  const job = await this.fullQueue.getJob(jobId);
  if (job) return job;
  return this.incrementalQueue.getJob(jobId);
}
```

---

## §3. 延迟任务

### 场景：定时同步

```
需求: 用户触发同步,但希望 5 分钟后再执行 (避开高峰期)
当前: 只能立即执行
新增: POST /api/sync/delayed/:businessLine?delay=300
```

### 实现

```ts
// sync.service.ts
async triggerDelayedSync(businessLine: BusinessLineCode, delaySeconds: number) {
  const job = await this.fullQueue.add(
    'sync',
    {
      businessLine,
      type: 'full' as const,
      triggeredBy: 'delayed' as const,
      timestamp: new Date(),
    },
    {
      delay: delaySeconds * 1000,  // BullMQ delay 用毫秒
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
  return { status: 'scheduled', type: 'full', businessLine, jobId: job.id, delaySeconds };
}
```

```ts
// sync.controller.ts
@Post('delayed/:businessLine')
triggerDelayedSync(
  @Param('businessLine') businessLine: string,
  @Query('delay') delay: string,
) {
  if (!isValidBusinessLine(businessLine)) {
    throw new BadRequestException(`Invalid business line: ${businessLine}`);
  }
  const delaySeconds = parseInt(delay, 10) || 60;
  return this.syncService.triggerDelayedSync(businessLine, delaySeconds);
}
```

---

## §4. 限流（Rate Limiter）

### 为什么需要限流？

```
场景: ES 集群承受能力有限
  如果同时触发 100 个同步任务 → ES 过载

解决: BullMQ 内置限流
  max: 5        → 每个时间窗口最多处理 5 个 Job
  duration: 1000 → 时间窗口 1 秒
```

### 配置方式

```ts
// Worker 级别限流
@Processor({
  name: 'sync-full',
  limiter: {
    max: 5,        // 每个时间窗口最多 5 个 Job
    duration: 1000, // 1 秒
  },
})
export class SyncFullConsumer extends WorkerHost { ... }
```

### vs NestJS Throttler

| | BullMQ Limiter | NestJS Throttler |
|---|----------------|------------------|
| 作用对象 | Queue Job | HTTP 请求 |
| 存储 | Redis | 内存 / Redis |
| 粒度 | 按 Queue | 按 IP / 全局 |

---

## §5. 设计决策

### 决策 1 · 事件监听放在哪里？

```
方案 A: 每个 Worker 内部处理
  在 @Process 方法里直接处理
  问题: Worker 只关心执行,不该管监控

方案 B: Queue 级别事件 (当前方案) ✅
  在 Producer (SyncService) 里监听
  集中管理,便于扩展 (发通知/写数据库)
```

### 决策 2 · Job 状态查哪个 Queue？

```
方案 A: 前端传 queue 名
  暴露内部实现,不友好

方案 B: 两个 Queue 都查 (当前方案) ✅
  前端只传 jobId,后端自动查找
  封装细节
```

---

## §6. Quiz

**Q1: BullMQ 事件 `stalled` 表示什么？**

A) Job 执行太慢
B) Worker 可能崩溃了，Job 没有正常完成
C) Queue 满了

**Q2: 延迟任务在 Redis 里用什么数据结构存储？**

A) List
B) String
C) Sorted Set（score = 执行时间戳）

**Q3: BullMQ 限流和 NestJS Throttler 的区别？**

A) 没区别，都是限流
B) BullMQ 限流针对 Queue Job，Throttler 针对 HTTP 请求
C) BullMQ 限流更快

---

## §7. Commit Message

```
feat(sync-service): 0035 BullMQ 事件监听 + Job 监控 + 延迟任务

- SyncService 加事件监听 (completed/failed/stalled)
- SyncController 加 GET /api/sync/jobs/:id
- 加延迟任务 endpoint POST /api/sync/delayed
- 21 测试还过
```

---

## §8. 跨节链接

- [0034 · BullMQ 核心](./0034-bullmq-core.md) — 上一课（理论）
- [0036 · BullMQ 收官](./0036-bullmq-finale.md) — 下一课（限流 + 监控 Dashboard）
- [sync.service.ts](../../apps/sync-service/src/sync/sync.service.ts) — Producer
- [sync.consumer.ts](../../apps/sync-service/src/sync/sync.consumer.ts) — Worker
