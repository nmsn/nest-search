# 0049 · 错误处理实战：Circuit Breaker 应用 + 进程级隔离

> Phase B 收官之 2。把 0048 的工具**实际应用到业务代码**，并补齐真正的 bulkhead 隔离。

## 你今天会拿到什么

1. 把 `CircuitBreaker` 应用到 `search-service`（防止 ES 过载）
2. 把 `retry` 工具应用到 `search-service`（搜索偶发超时）
3. 理解 nest-search 当前**真正的隔离边界**
4. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 0048 留的"债"

```
0048 实际完成的:
  ✅ retry 工具 - sync.consumer.ts 在用
  ✅ CircuitBreaker class - 已实现但未集成
  ❌ 真正的 bulkhead 隔离 - BullMQ limiter 不是

0049 要做的:
  1. 把 CircuitBreaker 集成到 search-service
  2. search-service 也用 retry 处理偶发超时
  3. 明确当前架构的隔离边界
```

### 1.2 search-service 失败点

```
GET /api/search/ds/products
  → search.service.searchProducts
    → esService.search()
      → ES 集群

失败场景:
  - ES 集群过载（query 慢/超时）
  - ES 集群挂（所有 query 失败）
  - 网络抖动（偶发超时）

没 Circuit Breaker 时:
  - 1000 个并发查询打到过载 ES
  - ES 更慢
  - 雪崩

有 Circuit Breaker 时:
  - 失败 5 次后熔断
  - 后续请求快速失败（不再调 ES）
  - 30s 后半开试探
  - 恢复则关闭,否则继续熔断
```

---

## §2. search-service 改造

### 2.1 加 retry + circuit-breaker

```ts
// apps/search-service/src/elasticsearch/elasticsearch.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { retry, CircuitBreaker } from '../../libs/shared/index';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  public client!: Client;
  private searchBreaker = new CircuitBreaker(5, 30000);  // 5 次失败 → 熔断 30s

  onModuleInit() {
    const esNode = this.config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.client = new Client({ node: esNode });
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  // 搜索: 熔断器 + retry
  async search(indexName: string, body: any) {
    return this.searchBreaker.execute(() =>
      retry(() => this.client.search({ index: indexName, body }), {
        maxRetries: 2,
        baseDelay: 500,  // 搜索要快,重试间隔短
      }),
    );
  }

  // 读取单文档: 熔断器 + retry
  async getDocument(indexName: string, id: string) {
    return this.searchBreaker.execute(() =>
      retry(() => this.client.get({ index: indexName, id })),
    );
  }

  // 索引创建/删除: 不重试（创建失败是永久错误,重试浪费）
  async createIndexIfNotExists(...) { ... }
  async deleteIndex(...) { ... }
}
```

### 2.2 关键点

| 操作 | 重试？ | 熔断？ | 原因 |
|------|--------|--------|------|
| search / getDocument | ✅ | ✅ | 偶发网络问题,ES 临时过载 |
| createIndex / deleteIndex | ❌ | ❌ | 永久错误,重试浪费 |
| bulk write | ✅ | ⚠️ 可选 | bulk 失败重试有副作用(可能重复) |

### 2.3 bulk write 的特殊性

```
sync-service bulk write:
  await esClient.bulk({ operations });
  // 如果中途失败,部分数据可能已经写入
  // 重试 = 可能重复 (但 ES 用 _id 幂等,productId 不会重复)
  
  实际 nest-search 用 productId 作为 _id:
    → 重复写入是覆盖,数据一致
    → 重试安全
```

---

## §3. 真正的 Bulkhead 隔离

### 3.1 nest-search 当前架构

```
nest-search monorepo:
  apps/
    sync-service   (BullMQ consumer)
    search-service (HTTP API)
    auth-service   (HTTP API)
    form-service   (HTTP API)
    gateway        (HTTP gateway)
  
  → 5 个独立 NestJS 应用
  → 5 个独立 Node.js 进程
  → 5 个独立 Event Loop
```

**已经是进程级隔离了** ✅

### 3.2 各服务职责

| 服务 | 资源 | 隔离 |
|------|------|------|
| **sync-service** | 定时同步、ES bulk | ✅ 独立进程 |
| **search-service** | ES 查询 | ✅ 独立进程 |
| **auth-service** | PG、Redis | ✅ 独立进程 |
| **form-service** | PG 表单 | ✅ 独立进程 |
| **gateway** | 路由 | ✅ 独立进程 |

### 3.3 sync-service 内的 worker

```
sync-service 进程内有 2 个 worker:
  - SyncFullConsumer (sync-full queue)
  - SyncIncrementalConsumer (sync-incremental queue)

同一个 Event Loop:
  - 如果 SyncFullConsumer 跑 CPU 密集 → Event Loop 卡死
  - → SyncIncrementalConsumer 也会卡
  - → 这是单进程内的"软隔离"不彻底

解决方案:
  方案 A: 不同服务化部署 (sync-full 一个进程,sync-incremental 一个进程)
  方案 B: PM2 cluster mode (NestJS 多实例)
  方案 C: 接受当前现状 (数据量小,够用)
```

### 3.4 nest-search 决策

```
当前数据量: 30 条产品,3 个业务线
1 年后: 几千条
结论: 单进程 sync-service 完全够用
  → BullMQ limiter (5 并发) 已经是"软 bulkhead"
  → 不需要进一步优化
  → 但要知道: 真过载时要靠进程级隔离
```

---

## §4. 监控错误处理

### 4.1 关键指标

```ts
// 在 ElasticsearchService 加监控
async search(indexName: string, body: any) {
  const start = Date.now();
  try {
    return await this.searchBreaker.execute(() =>
      retry(() => this.client.search({ index: indexName, body })),
    );
  } catch (err) {
    // 记录熔断/重试/失败次数
    this.metrics.searchError.inc();
    throw err;
  } finally {
    this.metrics.searchDuration.observe(Date.now() - start);
  }
}
```

### 4.2 监控项

| 指标 | 含义 | 阈值 |
|------|------|------|
| `es_search_duration` | 搜索耗时 | P99 < 200ms |
| `es_search_errors_total` | 搜索失败次数 | < 1% |
| `es_circuit_state` | 熔断器状态 (0=closed, 1=open) | 0 |
| `es_bulk_errors_total` | bulk 失败次数 | < 1% |

（生产环境用 Prometheus，nest-search 当前 nestjs-pino + slowlog 够用）

---

## §5. 实战 demo

### 5.1 验证 CircuitBreaker 触发

```ts
// 测试场景: 模拟 ES 持续失败
const breaker = new CircuitBreaker(3, 5000);  // 3 次失败就熔断 5s

let callCount = 0;
const failingFn = async () => {
  callCount++;
  throw new Error('ES timeout');
};

// 第一次失败
try { await breaker.execute(failingFn); } catch {}
// 第二次失败
try { await breaker.execute(failingFn); } catch {}
// 第三次失败 → 熔断!
try { await breaker.execute(failingFn); } catch {}

// 第四次: 熔断器 OPEN,直接拒绝 (不调 fn)
try {
  await breaker.execute(failingFn);
} catch (err) {
  console.log(err.message);  // "Circuit breaker is OPEN"
}
console.log(callCount);  // 3 (fn 只被调了 3 次,后面直接拒绝)
```

---

## §6. nest-search 当前状态总结

```
错误处理能力:
  ✅ Retry 工具 - 跨 sync + search 都可用
  ✅ Circuit Breaker class - 跨 sync + search 都可用
  ⚠️ 真正 bulkhead - 进程级隔离已有,sync 内部"软隔离"不彻底
  
监控能力:
  ✅ 慢查询日志（0046 加的中间件）
  ✅ PinoLogger 结构化日志
  ❌ Prometheus metrics (没接,生产再加)
  ❌ 健康检查 endpoint 暴露熔断状态
```

---

## §7. Quiz

**Q1: search 操作为什么用熔断器？**

A) 防止 ES 过载（持续失败时快速失败，保护下游）
B) 提高响应速度
C) 减少日志

**Q2: nest-search 真正的 bulkhead 隔离是什么？**

A) BullMQ limiter
B) 5 个独立 Node.js 进程
C) Docker 容器

**Q3: bulk write 用 retry 安全吗？**

A) 否，会重复
B) 是，用 productId 作 _id 幂等
C) 不确定

---

## §8. Commit Message

```
feat(search-service): 0049 错误处理实战

- elasticsearch.service.ts: search/getDocument 加 retry + circuit breaker
- 搜索: maxRetries 2, baseDelay 500ms (快)
- CircuitBreaker: 5 次失败 → 熔断 30s
- createIndex/deleteIndex 不重试 (永久错误)
- 21 测试全过
```

---

## §9. 跨节链接

- [0048 · 错误处理模式](./0048-error-handling-patterns.md) — 上一课
- [0050 · 测试进阶](./0050-contract-testing.md) — 下一课（Phase C 开始）
- [elasticsearch.service.ts](../../apps/search-service/src/elasticsearch/elasticsearch.service.ts) — 业务接入点
