# 0053 扩展 · Grafana Dashboard 设计

> Phase C 选修扩展。0053 讲了 Prometheus 暴露指标，本节讲 **Grafana Dashboard** 把这些指标可视化。

## 你今天会拿到什么

1. 启动 **Prometheus + Grafana**（Docker compose）
2. Grafana 接入 Prometheus 数据源
3. 设计 **nest-search Dashboard**
4. 4 个核心 Panel：可用性 / QPS / 错误率 / P95
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 0053 现状

```
上一节 0053:
  ✅ Prometheus 拉指标
  ✅ search-service 暴露 /metrics
  ✅ 告警规则配置
  ❌ 没有可视化大盘
  
没有 Grafana 时:
  - 想知道错误率? → 写 PromQL
  - 想知道 P95? → 写 PromQL
  - 想看趋势? → 写 PromQL
  
有 Grafana:
  - 打开网页, 看图
  - 拖时间范围
  - 看趋势
```

### 1.2 nest-search 价值

```
✅ 简历能写:
  - "设计 Grafana Dashboard 监控 nest-search 5 个服务"
  - "配置 Prometheus + Alertmanager 完整监控告警体系"
  - "用过 PromQL 查询业务指标"
```

---

## §2. Grafana 是什么

### 2.1 一句话

```
Grafana = 开源可视化平台
  - 把 Prometheus 指标变成图表
  - 支持多种数据源 (Prometheus / ES / MySQL / Loki)
  - 拖拽式 Dashboard 配置
  - 大厂标配
```

### 2.2 同类工具

| 工具 | 特点 |
|------|------|
| **Grafana** | 大厂标配, 拖拽配置 |
| Kibana | ES 专用, 日志可视化强 |
| Datadog | 商业, 完整 APM |
| 自建前端 | 大厂内部 (字节/腾讯) |

---

## §3. Docker compose 启动

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: nest-search-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alert.rules.yml:/etc/prometheus/alert.rules.yml

  grafana:
    image: grafana/grafana:latest
    container_name: nest-search-grafana
    ports:
      - "3001:3000"   # 3000 端口易冲突, 改 3001
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - prometheus
```

```bash
# 启动
docker compose -f docker-compose.monitoring.yml up -d

# 访问
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001
# 用户名: admin / 密码: admin
```

---

## §4. Grafana 配置 Prometheus 数据源

### 4.1 步骤

```
1. 打开 http://localhost:3001
2. 登录 admin/admin
3. 左侧菜单: Connections → Data sources
4. 点 "Add data source"
5. 选 "Prometheus"
6. URL: http://prometheus:9090
   (注意: Docker 网络用服务名, 不是 localhost)
7. 点 "Save & test"
8. 看到 ✅ "Data source is working"
```

---

## §5. nest-search Dashboard 设计

### 5.1 4 个核心 Panel

```
┌─────────────────────────────────────┐
│ Panel 1: 服务可用性                  │
│ 5 个服务 up 状态 (绿/红)            │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Panel 2: 请求速率 (QPS)             │
│ 5 个服务, 按服务分色                │
│ rate(http_requests_total[5m])        │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Panel 3: 错误率                     │
│ 5xx / 总数, 0-100%                  │
│ sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Panel 4: P95 响应时间               │
│ histogram_quantile(0.95, ...)       │
└─────────────────────────────────────┘
```

### 5.2 每个 Panel 的 PromQL

```promql
# Panel 1: 服务可用性
up{job="nest-search"}

# Panel 2: QPS
sum by (service) (rate(http_requests_total[5m]))

# Panel 3: 错误率
sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) /
sum by (service) (rate(http_requests_total[5m]))

# Panel 4: P95
histogram_quantile(0.95,
  sum by (service, le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

---

## §6. 实战：导入 Dashboard JSON

### 6.1 nest-search Dashboard JSON

```json
{
  "title": "nest-search 服务监控",
  "panels": [
    {
      "title": "服务可用性",
      "type": "stat",
      "targets": [
        { "expr": "up{job=\"nest-search\"}", "legendFormat": "{{service}}" }
      ],
      "fieldConfig": {
        "defaults": {
          "mappings": [
            { "type": "value", "options": { "0": { "text": "DOWN", "color": "red" }, "1": { "text": "UP", "color": "green" } } }
          ]
        }
      }
    },
    {
      "title": "QPS (每秒请求)",
      "type": "graph",
      "targets": [
        { "expr": "sum by (service) (rate(http_requests_total[5m]))", "legendFormat": "{{service}}" }
      ]
    },
    {
      "title": "错误率",
      "type": "graph",
      "targets": [
        { "expr": "sum by (service) (rate(http_requests_total{status=~\"5..\"}[5m])) / sum by (service) (rate(http_requests_total[5m]))", "legendFormat": "{{service}}" }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "percentunit",
          "max": 1,
          "min": 0
        }
      }
    },
    {
      "title": "P95 响应时间",
      "type": "graph",
      "targets": [
        { "expr": "histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))", "legendFormat": "{{service}}" }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "s"
        }
      }
    }
  ]
}
```

### 6.2 导入流程

```
1. 打开 Grafana
2. 左侧菜单: Dashboards → Import
3. 上传 JSON 文件
4. 选 Prometheus 数据源
5. 点 Import
6. Dashboard 出现
```

---

## §7. 实战：创建 Prometheus 拉取配置

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

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
```

---

## §8. nest-search 实际跑起来

```bash
# 1. 启动 nest-search 5 个服务
pnpm run start:all &

# 2. 启动监控栈
docker compose -f docker-compose.monitoring.yml up -d

# 3. 访问 Grafana
# http://localhost:3001 (admin/admin)
# 导入 nest-search dashboard JSON
# 看到实时图表
```

---

## §9. 课程调整

### 序号调整

| 原序号 | 新序号 | 主题 | 状态 |
|--------|--------|------|------|
| 0053 | 0053 | Prometheus 集成 | ✅ 已做 |
| 0053a (新) | 0053a | Grafana Dashboard | ⏳ 本节做 |
| 0054 | 0054 | OpenTelemetry | 跳过 |
| 0055 | 0055 | OAuth + OIDC | ✅ |
| 0056 | 0056 | RBAC | ✅ |
| 0057 | 0057 | WebSocket | ✅ |
| 0058 | 0058 | SSE | ✅ |
| 0059 | 0059 | 文件上传 | ✅ |
| 0060 | 0060 | DI scope | ✅ |
| 0061 | 0061 | API 版本 | ✅ |
| 0062 | 0062 | 外键禁用 | 🔜 下一课 |
| ... | ... | ... | ... |

**总课数：67 → 68**（+1 节 Grafana）

### 文件命名

```
0053-prometheus-metrics.md       (原, 保持)
0053a-grafana-dashboard.md      (新增)
```

---

## §10. Quiz

**Q1: Grafana 跟 Prometheus 的关系？**

A) 替代关系
B) Grafana 用 Prometheus 的数据做可视化
C) 互不相干

**Q2: nest-search Dashboard 应该有几个核心 Panel？**

A) 1-2 个
B) 4-6 个 (QPS/错误率/P95/可用性)
C) 20+ 个

**Q3: Grafana 配置数据源用服务名还是 localhost？**

A) localhost
B) 服务名 (Docker 网络)
C) IP

---

## §11. Commit Message

```
feat(monitoring): 0053a Grafana Dashboard

- docker-compose.monitoring.yml: Prometheus + Grafana
- prometheus/prometheus.yml: 5 服务 scrape config
- grafana-dashboard.json: nest-search Dashboard (4 Panel)
- docs/teaching/lessons/0053a-grafana-dashboard.md
- 21 测试还过
```

---

## §12. 跨节链接

- [0053 · Prometheus](./0053-prometheus-metrics.md) — 上一节
- [0062 · 外键禁用](./0062-no-fk-business-consistency.md) — 下一课
- [docker-compose.monitoring.yml](../../docker-compose.monitoring.yml) — 启动配置
