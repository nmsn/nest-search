# nest-search Prometheus + Alertmanager 配置

> Phase C 第 4 课（0053）。生产级监控告警配置。

## 架构

```
┌──────────────┐
│  5 个服务     │  ← /metrics endpoint
└──────┬───────┘
       │ 拉取
       ▼
┌──────────────┐
│ Prometheus   │  ← 存储 + 计算
└──────┬───────┘
       │ 触发
       ▼
┌──────────────┐
│ Alertmanager │  ← 路由告警
└──────┬───────┘
       │ 通知
       ▼
┌──────────────┐
│ Slack 频道   │
└──────────────┘
```

## Prometheus 配置

### `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'nest-search-prometheus'

# 告警规则
rule_files:
  - "alert.rules.yml"

# Alertmanager 地址
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# 拉取配置
scrape_configs:
  - job_name: 'nest-search'
    metrics_path: /metrics
    static_configs:
      - targets:
          - 'gateway:3000'
          - 'auth-service:3000'
          - 'search-service:3002'
          - 'form-service:3004'
          - 'sync-service:3005'
        labels:
          project: 'nest-search'
```

## 告警规则

### `alert.rules.yml`

```yaml
groups:
  - name: nest-search-availability
    rules:
      # 服务不可用
      - alert: ServiceDown
        expr: up{job="nest-search"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} 不可用"
          description: "服务已 1 分钟无响应, 请检查进程"

  - name: nest-search-performance
    rules:
      # P95 响应 > 1s
      - alert: SlowResponse
        expr: |
          histogram_quantile(0.95,
            sum by (service, le) (rate(http_request_duration_seconds_bucket[5m]))
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.service }} 响应过慢"
          description: "P95 = {{ $value }}s, 目标 < 500ms"

      # 错误率 > 5%
      - alert: HighErrorRate
        expr: |
          sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) /
          sum by (service) (rate(http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} 错误率过高"
          description: "错误率 {{ $value | humanizePercentage }}, 已持续 2 分钟"

  - name: nest-search-business
    rules:
      # 队列堆积
      - alert: QueueBacklog
        expr: bullmq_queue_size > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "队列 {{ $labels.queue }} 堆积"
          description: "队列长度 {{ $value }}, 已持续 10 分钟"

      # ES 熔断器打开
      - alert: CircuitBreakerOpen
        expr: es_circuit_breaker_state{type="search"} == 1
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} ES 熔断器打开"
          description: "ES 持续失败, 熔断器已打开"
```

## Alertmanager 配置

### `alertmanager.yml`

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'service']
  group_wait: 30s       # 等待 30s 看是否多告警合并
  group_interval: 5m    # 已发送告警, 5 分钟内不重发
  repeat_interval: 4h    # 同一告警 4 小时提醒一次
  receiver: 'slack-critical'

  # 不同严重程度走不同 receiver
  routes:
    - match:
        severity: warning
      receiver: 'slack-warning'

receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        channel: '#nest-search-alerts'
        title: '🚨 {{ .GroupLabels.alertname }}'
        text: |
          服务: {{ .GroupLabels.service }}
          严重: {{ .CommonLabels.severity }}
          详情: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        channel: '#nest-search-warnings'
        title: '⚠️ {{ .GroupLabels.alertname }}'
        text: |
          服务: {{ .GroupLabels.service }}
          详情: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}
```

## 启动（Docker Compose）

### `docker-compose.monitoring.yml`

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: nest-search-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./docs/operations/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./docs/operations/prometheus/alert.rules.yml:/etc/prometheus/alert.rules.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  alertmanager:
    image: prom/alertmanager:latest
    container_name: nest-search-alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./docs/operations/prometheus/alertmanager.yml:/etc/alertmanager.yml

  grafana:
    image: grafana/grafana:latest
    container_name: nest-search-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - prometheus
```

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

## nest-search 集成 Prometheus 客户端

### search-service 加监控

```bash
pnpm add -w @willsoto/nestjs-prometheus prom-client
```

### app.module.ts

```ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // ... 现有 imports
    
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      defaultLabels: {
        service: 'search-service',
      },
    }),
  ],
})
export class AppModule {}
```

### 自动暴露 /metrics

```ts
// 不需要额外代码, PrometheusModule 自动注册 GET /metrics
// 访问 http://localhost:3002/metrics 看指标
```

### 业务指标（Counter + Histogram）

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
    
    this.httpRequestsTotal.inc({
      endpoint: '/api/search/ds/products',
      status: '200',
    });
    
    this.httpRequestDuration.observe(
      { endpoint: '/api/search/ds/products' },
      (Date.now() - start) / 1000,
    );
    
    return res;
  }
}
```

## 关键 PromQL

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

# 队列长度
bullmq_queue_size

# 熔断器状态
es_circuit_breaker_state
```

## nest-search 集成进度

| 服务 | 接入 Prometheus | 业务指标 |
|------|---------------|---------|
| search-service | ✅ (本课示范) | HTTP + ES |
| gateway | ⚠️ 复制同样模式 | HTTP |
| auth-service | ⚠️ 复制 | HTTP |
| form-service | ⚠️ 复制 | HTTP |
| sync-service | ⚠️ 复制 | BullMQ + ES bulk |

## 相关文件

- `prometheus.yml` - Prometheus 主配置
- `alert.rules.yml` - 告警规则
- `alertmanager.yml` - 告警路由
- `docker-compose.monitoring.yml` - 启动配置
- `../../docs/teaching/lessons/0053-prometheus-metrics.md` - 课程文档
