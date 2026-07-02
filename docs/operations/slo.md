# nest-search SLO 文档

> Phase C 第 3 课（0052）。定义 nest-search 5 个服务的稳定性指标。

## 核心 SLI / SLO / SLA 概念

```
SLI (Service Level Indicator) = 测量指标
  例: P95 响应时间, 错误率, 可用性

SLO (Service Level Objective) = 目标值
  例: P95 < 500ms, 错误率 < 1%, 可用性 > 99.5%

SLA (Service Level Agreement) = 客户合同承诺
  例: 99.9% 可用 (达不到赔钱)
```

## 5 个服务的 SLO 定义

### 1. gateway

**职责**：路由 + 鉴权

| SLI | SLO | 测量 |
|-----|-----|------|
| 可用性 | > 99.9% | uptime / 30d |
| 路由响应 P95 | < 100ms | Pino 日志 |
| 错误率（5xx）| < 0.5% | Pino 日志 |

**为什么 99.9%**：gateway 是所有请求入口, 挂了所有服务都访问不了, 严格要求。

**为什么 100ms**：纯转发, 100ms 已包含网络 + 鉴权 overhead。

### 2. auth-service

**职责**：登录 + JWT 签发 + 验证

| SLI | SLO | 测量 |
|-----|-----|------|
| 可用性 | > 99.5% | uptime / 30d |
| 登录响应 P95 | < 300ms | 日志 |
| JWT 验证响应 P95 | < 50ms | 日志 |
| 登录错误率 | < 0.5% | 日志 |
| 401 比例 | < 5% | 日志（5% 算正常, token 过期）|

**为什么 99.5%**：非支付类, 99.5% 月不可用 ≤ 3.6 小时, 足够。

**为什么 401 比例 < 5%**：token 过期是正常的, 超过 5% 说明客户端实现有 bug。

### 3. form-service

**职责**：表单提交 / 用户行为

| SLI | SLO | 测量 |
|-----|-----|------|
| 可用性 | > 99.5% | uptime / 30d |
| 提交响应 P95 | < 500ms | 日志 |
| 错误率（5xx）| < 1% | 日志 |

### 4. search-service

**职责**：ES 查询 + 聚合

| SLI | SLO | 测量 |
|-----|-----|------|
| 可用性 | > 99.5% | uptime / 30d |
| 搜索响应 P95 | < 500ms | k6 / Pino |
| 搜索错误率 | < 1% | Pino |
| 搜索吞吐 | > 100 RPS | k6 压测 |

**为什么 99.5%**：商品搜索是核心功能, 但数据可重建, 不用 99.99%。

**为什么 P95 < 500ms**：用户对搜索延迟敏感, 500ms 是搜索体验底线。

### 5. sync-service

**职责**：从第三方同步产品数据

| SLI | SLO | 测量 |
|-----|-----|------|
| 同步成功率 | > 99% | sync-records 表 |
| 同步延迟 P95（入队→完成）| < 60s | 日志 + 时间戳 |
| 队列堆积 | waiting < 100 | BullMQ stats |
| 同步吞吐 | > 50 jobs / hour | BullMQ stats |

**为什么 99% 同步成功率**：同步失败可以重跑, 99% 足够。

**为什么 60s 延迟**：用户感知"数据更新"的容忍度是 1 分钟。

---

## Error Budget 实践

### 月度预算计算

```
SLO 99.5%:
  30 天 × 24 × 60 = 43200 分钟
  Error budget = 43200 × 0.5% = 216 分钟 ≈ 3.6 小时

SLO 99.9% (gateway):
  Error budget = 43200 × 0.1% = 43.2 分钟
```

### 预算耗尽怎么办？

```
剩余 30% 以下:
  ⚠️ 减少新功能发布
  ⚠️ 团队 focus 稳定性
  ⚠️ 修复已知故障
  ⚠️ 重新评估 SLO 是否合理

剩余 0%:
  🔴 冻结所有发布
  🔴 全部人力投入稳定性
```

---

## 测量方法

### 数据源

| 数据 | 工具 | 频率 |
|------|------|------|
| 响应时间 | Pino + 慢查询中间件 | 实时 |
| 错误率 | Pino ERROR 日志聚合 | 实时 |
| 可用性 | uptime 监控（k8s / 进程） | 实时 |
| 吞吐 | k6 压测 / BullMQ stats | 定期 |

### nest-search 工具栈

```
日志: nestjs-pino (结构化 JSON)
聚合: 0051 k6 压测 (P95 测量)
监控: 0053 Prometheus (Phase C 选修)
告警: Alertmanager (生产再加)
```

---

## SLO 评审周期

```
每季度评审一次:
  - SLO 是否合理（太严/太松）
  - Error budget 消耗趋势
  - 重大故障复盘
  - SLO 调整

调整原则:
  - 业务关键度变化时调整（支付变严, 内部系统放宽）
  - 不要随便调 SLO（失去意义）
```

---

## nest-search SLO Dashboard（待实现）

```
P95 响应时间（5 个服务）
  ↑ yellow > 400ms / red > 500ms

错误率（5 个服务）
  ↑ yellow > 0.5% / red > 1%

可用性（30 天滚动）
  ↑ yellow < 99.5% / red < 99%
```

工具：Grafana + Prometheus（Phase C 0053 选修）

---

## 相关文件

- `docs/teaching/lessons/0052-slo-sli.md` - 课程文档
- `docs/operations/slo.md` - 本文档
- `docs/testing/load-test-report.md` - 压测报告（用于 SLO 校准）
