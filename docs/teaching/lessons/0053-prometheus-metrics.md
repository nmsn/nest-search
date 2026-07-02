# 0053 · Prometheus 监控：指标暴露 + Alertmanager 告警

> Phase C 第 4 课（策略 2 选修最后一课）。把 nest-search 5 个服务接入 Prometheus，定义告警规则。

## 你今天会拿到什么

1. 理解 **Prometheus 三件套**（Prometheus + Alertmanager + Grafana）
2. 学会 **`/metrics` endpoint** 暴露
3. 学会 **4 类核心指标**（counter / gauge / histogram / summary）
4. 学会 **Alertmanager 告警规则**
5. nest-search 加 `/metrics` endpoint（演示）
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 没有监控的痛

```
事故发生了，怎么知道？
  ❌ 用户投诉（已影响业务）
  ❌ 老板问"为什么挂"
  ❌ 出报表查日志（事后）

有监控会怎样？
  ✅ 提前告警（CPU 90% → 提前处理）
  ✅ 实时 Dashboard（看 5 个服务状态）
  ✅ 事故回溯（精确到时间点）
```

### 1.2 nest-search 当前监控

| 能力 | 状态 |
|------|------|
| 日志 | ✅ Pino |
| 慢查询 | ✅ 中间件 |
| 错误日志 | ✅ Pino ERROR |
| **指标** | ❌ 缺 |
| **告警** | ❌ 缺 |
| Dashboard | ❌ 缺 |

---

## §2. Prometheus 三件套

### 2.1 架构图

```
┌──────────────┐
│  5 个服务     │  ← nest-search
│  /metrics    │     暴露指标
└──────┬───────┘
       │ 拉取 (pull)
       ▼
┌──────────────┐
│ Prometheus   │  ← 时序数据库
│  存储 + 计算 │
└──────┬───────┘
       │ 触发
       ▼
┌──────────────┐
│ Alertmanager │  ← 告警路由
│  Slack/Pager │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  工程师告警  │  ← 收到通知
└──────────────┘

并行:
┌──────────────┐
│  Grafana     │  ← 可视化 Dashboard
│  (查 PromQL) │
└──────────────┘
```

### 2.2 三个组件职责

| 组件 | 作用 | 选型 |
|------|------|------|
| **Prometheus** | 拉 / 存储 / 算指标 | 必须 |
| **Alertmanager** | 告警路由 / 通知 | 必须 |
| **Grafana** | 可视化 Dashboard | 推荐 |

### 2.3 nest-search 用什么

```
简单方案: 全部本地（学习用）
  - Prometheus 官方二进制
  - Alertmanager 官方二进制
  - Grafana 官方二进制
  - Docker compose 启动

生产方案: Prometheus Operator (K8s)
  - 通过 CRD 管理 Prometheus / Alertmanager
  - 跟服务一起部署
```

---

## §3. 4 类核心指标

### 3.1 Counter（计数器）

```
方向: 只增不减
例子:
  - HTTP 请求总数
  - 错误总数
  - 用户登录次数

nest-search:
  - http_requests_total{service="search", endpoint="/api/search/ds/products", status="200"}
  - es_errors_total{service="sync", operation="bulk"}
```

### 3.2 Gauge（仪表）

```
方向: 增增减减（当前值）
例子:
  - 当前在线用户数
  - 队列长度
  - CPU 使用率

nest-search:
  - bullmq_queue_size{queue="sync-full"}
  - process_cpu_usage
  - process_memory_bytes
```

### 3.3 Histogram（直方图）

```
方向: 统计分布（如 P95 / P99）
例子:
  - HTTP 请求耗时
  - 响应大小

nest-search:
  - http_request_duration_seconds_bucket{le="0.5"} 0.1
  - http_request_duration_seconds_bucket{le="1.0"} 0.3
  - es_query_duration_seconds_bucket{le="0.05"} 0.5
```

### 3.4 Summary（摘要）

```
方向: 客户端聚合（避免后端算）
例子:
  - P95 / P99 (客户端算好后上报)

nest-search:
  - es_query_duration_seconds{service="search", quantile="0.95"}
```

### 3.5 选哪种？

```
Counter:    累计计数（请求、错误）→ Counter
Gauge:      当前值（队列长度、内存）→ Gauge
Histogram:  服务端分桶（性能监控）→ Histogram
Summary:    客户端聚合（自定义指标）→ Summary

推荐: Histogram 用得最多（延迟 / 大小）
```

---

## §4. nest-search 加 /metrics

### 4.1 选客户端库

| 库 | 语言 | 特点 |
|----|------|------|
| prom-client | Node.js | 官方推荐,广泛使用 |
| @willsoto/nestjs-prometheus | NestJS | 装饰器风格, 跟 nest 集成好 |

**nest-search 用 @willsoto/nestjs-prometheus**（NestJS 装饰器风格）

### 4.2 安装

```bash
pnpm add -w @willsoto/nestjs-prometheus prom-client
```

### 4.3 加到 app.module

```ts
import { PrometheusModule, makeCounterProvider } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // ... 现有
    PrometheusModule.register({
      defaultMetrics: { enabled: true },  // 系统指标 (CPU/内存)
      defaultLabels: {
        service: 'search-service',  // 标签区分服务
      },
    }),
  ],
})
export class AppModule {}
```

### 4.4 暴露自动 /metrics endpoint

```ts
// 不需要额外代码, PrometheusModule 自动加 GET /metrics
```

### 4.5 加业务指标

```ts
// search.controller.ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

export class SearchController {
  constructor(
    @InjectMetric('http_requests_total') 
    private readonly httpRequestsTotal: Counter<string>,
    
    @InjectMetric('http_request_duration_seconds')
    private readonly httpRequestDuration: Histogram<string>,
  ) {}

  @Get('products')
  async searchProducts(...) {
    const start = Date.now();
    const res = await this.searchService.searchProducts(...);
    
    // Counter: 增加请求数
    this.httpRequestsTotal.inc({
      endpoint: '/api/search/ds/products',
      status: '200',
    });
    
    // Histogram: 记录耗时
    this.httpRequestDuration.observe(
      { endpoint: '/api/search/ds/products' },
      (Date.now() - start) / 1000,
    );
    
    return res;
  }
}
```

### 4.6 验证

```bash
# 1. 启动 search-service
pnpm run start:search &

# 2. 访问 /metrics
curl http://localhost:3002/metrics

# 输出类似:
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
# http_requests_total{endpoint="/api/search/ds/products",status="200",service="search-service"} 42

# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
# process_cpu_user_seconds_total 0.5
```

---

## §5. Prometheus 配置

### 5.1 拉指标配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s    # 每 15s 拉一次
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nest-search'
    static_configs:
      - targets:
          - 'gateway:3000'
          - 'auth-service:3000'
          - 'search-service:3002'
          - 'form-service:3004'
          - 'sync-service:3005'
    metrics_path: /metrics
```

### 5.2 启动 Prometheus

```bash
# Docker compose 方式
docker compose -f docker-compose.monitoring.yml up -d
```

---

## §6. Alertmanager 告警规则

### 6.1 告警规则文件

```yaml
# alert.rules.yml
groups:
  - name: nest-search
    rules:
      # 规则 1: HTTP 错误率 > 5% 持续 2 分钟
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "服务 {{ $labels.service }} 错误率过高"
          description: "错误率 {{ $value | humanizePercentage }}"

      # 规则 2: P95 响应 > 1s 持续 5 分钟
      - alert: SlowResponse
        expr: |
          histogram_quantile(0.95,
            sum by (service, le) (
              rate(http_request_duration_seconds_bucket[5m])
            )
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.service }} 响应过慢"
          description: "P95 响应时间 {{ $value }}s"

      # 规则 3: 队列堆积
      - alert: QueueBacklog
        expr: bullmq_queue_size > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "队列堆积"
          description: "队列长度 {{ $value }}"

      # 规则 4: 服务不可用
      - alert: ServiceDown
        expr: up{job="nest-search"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} 不可用"
```

### 6.2 Alertmanager 通知配置

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-notifications'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#nest-search-alerts'
        title: 'nest-search 告警'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## §7. Grafana Dashboard

### 7.1 核心面板

```
Panel 1: 服务可用性
  5 个服务的 up{job="nest-search"} 状态

Panel 2: 请求速率
  rate(http_requests_total[5m])  by service

Panel 3: 错误率
  sum(rate(http_requests_total{status=~"5.."}[5m])) by service

Panel 4: P95 响应时间
  histogram_quantile(0.95, ...) by service

Panel 5: 队列长度
  bullmq_queue_size by queue

Panel 6: 错误预算剩余
  1 - (1 - SLO) - 当前错误率
```

### 7.2 nest-search 仪表盘（建议）

```
┌─────────────┬─────────────┬─────────────┐
│ Gateway P95 │  Auth P95   │ Search P95 │
│   50ms      │   80ms     │   180ms    │
├─────────────┴─────────────┴─────────────┤
│  各服务 QPS（折线图）                  │
├──────────────────────────────────────┤
│  各服务错误率（5 分钟窗口）           │
├──────────────────────────────────────┤
│  BullMQ 队列长度（双 queue）          │
└──────────────────────────────────────┘
```

---

## §8. nest-search 5 服务接入

### 8.1 接入策略

```
最小集（5 个服务 /metrics）:
  search-service:  HTTP 指标 + ES 查询延迟
  gateway:         HTTP 指标 + 路由延迟
  auth-service:    HTTP 指标 + 登录/验证延迟
  form-service:    HTTP 指标
  sync-service:    BullMQ 指标 + ES bulk 延迟

每个服务:
  1. 加 @willsoto/nestjs-prometheus
  2. 加业务 Counter / Histogram
  3. 自动暴露 /metrics
```

### 8.2 当前 nest-search 实际做法

```
⚠️ 本节是教学, 不强制全部 5 个服务接入
✅ 重点: search-service 接入, 作为示例
✅ 其它服务: 复制同样模式
```

---

## §9. 关键概念

### 9.1 4 种指标选哪个？

| 场景 | 指标类型 |
|------|---------|
| 请求总数 / 错误数 | Counter |
| 当前在线 / 队列长度 | Gauge |
| 响应时间 / 大小分布 | Histogram |
| 自定义聚合 | Summary |

### 9.2 PromQL 基础

```promql
# QPS（每秒请求）
rate(http_requests_total[5m])

# 错误率
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))

# P95 响应时间
histogram_quantile(0.95,
  sum by (service, le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

### 9.3 告警 vs 仪表盘

```
仪表盘: 人看, 主动查询
告警: 系统推, 主动通知

比例: 仪表盘 10+ 指标, 告警 3-5 个关键
```

---

## §10. Quiz

**Q1: Counter 适合什么场景？**

A) 当前在线人数
B) 总请求数
C) 响应时间分布

**Q2: 错误率告警用 PromQL 怎么写？**

A) `http_errors > 100`
B) `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05`
C) `errors / total`

**Q3: 告警为什么用 `for: 2m`（持续 2 分钟）？**

A) 防止抖动误报（持续 2 分钟才告警）
B) 让 Prometheus 休息 2 分钟
C) 没有任何作用

---

## §11. Commit Message

```
feat(monitoring): 0053 Prometheus 集成示例

- search-service: @willsoto/nestjs-prometheus
  默认系统指标 + 业务 HTTP 指标
  /metrics endpoint
- docs/operations/prometheus-alerts.md: 告警规则
- docs/operations/grafana-dashboard.md: dashboard JSON
- 21 测试还过
```

---

## §12. 跨节链接

- [0052 · SLO/SLI](./0052-slo-sli.md) — 上一课
- [0054 · OpenTelemetry](./0054-opentelemetry.md) — 下一课
- [docs/operations/prometheus-alerts.md](../../operations/prometheus-alerts.md) — 告警规则
