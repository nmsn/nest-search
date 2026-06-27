# 0036 · BullMQ 收官：Dashboard 监控 + 通用 Queue Module

> Phase B 第 6 课。BullMQ 深度 3 节收官。0034 讲理论，0035 加事件/监控/限流，0036 补 **Dashboard 可视化** + **通用 Queue Module 模式**。

## 你今天会拿到什么

1. 理解 **Bull Board**（Dashboard UI）的作用
2. 学会 **通用 Queue/Worker Module 设计模式**
3. 回顾 BullMQ 深度 3 节的知识图谱
4. 3 道 quiz

---

## §1. Bull Board（Dashboard UI）

### 为什么需要 Dashboard？

```
当前:
  GET /api/sync/jobs/:id → 只能查单个 Job
  没有全局视图: 有多少 Job 在排队? 失败了多少? 哪些在重试?

Bull Board:
  Web UI → 看到所有 Queue 的实时状态
  Job 列表 → 按状态筛选 (waiting/active/completed/failed)
  操作 → 重试失败的 Job / 删除 Job / 清空队列
```

### 安装

```bash
pnpm add @bull-board/api @bull-board/express @bull-board/nestjs
```

### 集成到 NestJS

```ts
// apps/sync-service/src/bull-board/bull-board.module.ts
import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
  ],
})
export class BullBoardConfigModule {}
```

### 效果

```
访问 http://localhost:3002/queues

┌─────────────────────────────────────────────┐
│  Bull Board                                 │
├──────────┬──────────┬──────────┬────────────┤
│  Queue   │ Waiting  │ Active   │ Failed     │
├──────────┼──────────┼──────────┼────────────┤
│sync-full │    3     │    1     │    0       │
│sync-incr │    0     │    0     │    2       │
└──────────┴──────────┴──────────┴────────────┘

点击 sync-incr → 看到失败的 Job → 点击 Retry → 重新执行
```

---

## §2. 通用 Queue/Worker Module 模式

### 当前问题

```
sync-service 的 Queue 配置散落在:
  sync.module.ts → BullModule.forRootAsync + registerQueue
  sync.service.ts → @InjectQueue
  sync.consumer.ts → @Processor

如果 auth-service 也想用 Queue:
  → 复制一遍 BullModule 配置
  → 重复代码
```

### 通用模式

```
通用 Queue Module:
  ├── BullModule.forRootAsync (Redis 连接,全局一次)
  ├── registerQueue (动态注册)
  └── 导出 Queue Token

业务 Module:
  ├── imports: [通用QueueModule]
  ├── Service: @InjectQueue('name')
  └── Consumer: @Processor('name')
```

### 实现思路

```ts
// 方案 A: 用 @Global() 装饰器
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({ ... }),
    BullModule.registerQueue({ name: 'sync-full' }, { name: 'sync-incremental' }),
  ],
  exports: [BullModule],
})
export class QueueGlobalModule {}

// 其他 service 直接用 @InjectQueue,不用再配 BullModule
```

```ts
// 方案 B: 动态注册 (更灵活)
@Module({
  imports: [
    BullModule.forRootAsync({ ... }),
    BullModule.registerQueue(
      { name: 'notifications' },
      { name: 'emails' },
    ),
  ],
})
export class NotificationModule {}
```

---

## §3. BullMQ 深度 3 节知识图谱

```
0031 Redis 数据结构
  └── Stream (消息队列基础)

0032 分布式锁 + Cache-Aside
  └── Redis 实战应用

0033 Pipeline + 性能基准
  └── Redis 性能优化

0034 BullMQ 核心 (理论)
  ├── Queue / Worker / Job 三角
  ├── Job 生命周期
  ├── 重试策略 (attempts + backoff)
  ├── 延迟任务
  └── 优先级队列

0035 BullMQ 进阶 (实战)
  ├── 事件监听 (completed/failed/stalled)
  ├── Job 状态查询 endpoint
  ├── 延迟任务 endpoint
  └── Worker 限流 (limiter)

0036 BullMQ 收官 (本节)
  ├── Dashboard 可视化 (Bull Board)
  └── 通用 Queue Module 模式
```

---

## §4. 设计决策

### 决策 1 · Dashboard 要不要上？

```
✅ 需要:
  多 Queue + 生产环境 → 需要可视化监控
  排查问题 → 快速看失败 Job

❌ 不需要:
  单 Queue + 开发阶段 → GET /jobs/:id 够用
  简单项目 → 增加复杂度不值得

nest-search: 2 个 Queue,学习项目 → 了解即可,不强制集成
```

### 决策 2 · 通用 Module 还是各配各的？

```
通用 Module:
  ✅ 避免重复配置
  ✅ Redis 连接全局共享
  ❌ 所有 Queue 在一个 Module 里,耦合

各配各的 (当前方案):
  ✅ 各 service 独立
  ✅ 配置清晰
  ❌ 如果多个 service 都用 Queue → 重复 BullModule.forRootAsync

建议: 2 个以上 service 用 Queue 时,提取通用 Module
```

---

## §5. Quiz

**Q1: Bull Board 的作用是什么？**

A) 替代 BullMQ,提供更好的 API
B) 提供 Web UI 可视化监控 Queue 和 Job 状态
C) 替代 Redis,提供更快的存储

**Q2: 什么时候应该提取通用 Queue Module？**

A) 任何用了 BullMQ 的项目
B) 2 个以上 service 都需要用 Queue 时
C) 只有 1 个 service 用 Queue 时

**Q3: Worker 限流（limiter）的 `max: 5, duration: 1000` 表示什么？**

A) 最多重试 5 次,每次等 1 秒
B) 每秒最多处理 5 个 Job
C) 最多有 5 个 Worker,每个运行 1 秒

---

## §6. Commit Message

```
docs(teaching): 0036 BullMQ 收官 lesson
```

---

## §7. 跨节链接

- [0035 · BullMQ 进阶](./0035-bullmq-advanced.md) — 上一课
- [0037 · Elasticsearch 基础](./0037-elasticsearch-fundamentals.md) — 下一课（Phase B 第 7 课）
- [sync.module.ts](../../apps/sync-service/src/sync/sync.module.ts) — BullMQ 配置
