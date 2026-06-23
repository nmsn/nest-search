# 总体课程设计 · 50 课时大纲

> 锚定项目:`nest-search`(NestJS 11 monorepo)
> 校准日期:2026-06-23
> 总目标:**50 课时**,从 0 学会 Node + NestJS + 数据库 + Docker 全栈企业级开发,把 nest-search 改造成最佳实践应用。

---

## Why(为什么这么设计)

用户的"原始规划"是 30-50 课时,从 0 学 Node/NestJS/DB/Docker。已学 18 课时,发现偏离:

| 偏离点 | 修正 |
|---|---|
| LR-0002 列的 10 个 nest-search 缺位,**4 个 MISSING** | 全部进 Phase A 必修 |
| 数据库只"用过"未"深入"(Drizzle 没专门课) | 进 Phase A 第 2 个 |
| Redis/RabbitMQ/Zod/Drizzle 全是"用过但未深入" | 进 Phase A / B 必修 |
| Docker 0 课时(MISSION out-of-scope 边缘) | 进 Phase C 加分,非必修 |
| 测试 / 健康检查 / 错误处理"浅做" | 全部进 Phase A 必修 |

---

## 总体节奏(18 已用 + 32 待开)

```
主线(8) → principles(4) → 副线1 测试(3) → 副线2 迁移(3)
         [已用 18]
                                              ↓
              Phase A 必修 12 → Phase B 深度 8 → Phase C 加分 5 → Phase D 全栈 7
              [0019-0030]      [0031-0038]      [0039-0043]      [0044-0050]
              [30 节总目标]     [38 节]          [43 节]          [50 节]
```

---

## 已完成:18 课时(2026-06-22 截止)

### 主线 · Node 运行时基础(0001-0008,8 节)

| 课 | 主题 |
|---|---|
| 0001 | node-runtime-for-frontend-dev(运行时模型) |
| 0002 | async-and-errors(异步 + 错误处理) |
| 0003 | process-lifecycle(SIGTERM / 优雅退出基础) |
| 0004 | request-lifecycle(HTTP 请求生命周期) |
| 0005 | pino-structured-logging(结构化日志) |
| 0006 | observability-closure(可观测性闭环) |
| 0007 | rate-limiting(限流 + 健康检查) |
| 0008 | main-arc-finale(主线收官) |

### principles 轨道 · NestJS 原理(0009-0012,4 节)

| 课 | 主题 |
|---|---|
| 0009 | decorators-and-metadata(装饰器与元数据) |
| 0010 | ioc-container(IoC 容器) |
| 0011 | aop-aspects(AOP 切面) |
| 0012 | module-system(Module 系统) |

### 副线 1 · 测试体系(0013-0015,3 节)

| 课 | 主题 |
|---|---|
| 0013 | jest-unit-testing(Jest 单元测试) |
| 0014 | supertest-e2e(Supertest e2e) |
| 0015 | github-actions-ci(GitHub Actions CI) |

### 副线 2 · 跨服务迁移(0016-0018,3 节)

| 课 | 主题 |
|---|---|
| 0016 | search-pino-migration(search 加 pino) |
| 0017 | sync-form-pino-migration(sync + form 加 pino) |
| 0018 | track2-finale(副线 2 收官 + 跨服务追踪实测) |

---

## Phase A · 必修 12 节 — 18 → 30

**目标**:补 LR-0002 4 个 MISSING 缺位 + 用户强调主题(数据库 / 配置校验)。

### 0019-0021 · Zod 配置校验(3 节)

- **缺口**:LR-0002 #6(ConfigModule 没接 Joi/Zod)
- **用户强调**:`zod` 是必修
- **覆盖**:所有 5 个服务的 env 变量校验 + 启动 fail-fast
- **预期交付**:`apps/shared/config/` + Zod schema + 启动校验中间件 + 18 测试还过

### 0022-0024 · Drizzle 深度(3 节)

- **缺口**:LR-0002 #6 之外,Drizzle ORM 隐含使用但没专门课
- **用户强调**:`drizzle` 是必修
- **覆盖**:Drizzle Kit 迁移 + relations API + 事务 + 索引 + drizzle-zod 集成
- **预期交付**:每个 service 加迁移脚本 + 关系建模 + drizzle-zod 推断 DTO

### 0025-0026 · 优雅退出 + AllExceptionsFilter 深入(2 节)

- **缺口**:LR-0002 #9(enableShutdownHooks 没装)+ #2(AllExceptionsFilter 浅做)
- **覆盖**:SIGTERM 处理 + 连接清理 + 业务异常分类 + Sentry 集成预留
- **预期交付**:每个 service 装 enableShutdownHooks + 业务异常基类 + 测试

### 0027-0028 · JWT 深入(2 节)

- **缺口**:LR-0002 #7(CasGuard 浅做,JWT 流程不完整)
- **覆盖**:refresh token rotation + 黑名单 + 自动续签 + 边界(过期/吊销)
- **预期交付**:auth-service 完整 token 生命周期 + 18 测试覆盖

### 0029-0030 · 健康检查深度(2 节)

- **缺口**:LR-0002 #3(terminus 浅做)
- **覆盖**:liveness vs readiness + 自定义 indicator(数据库/Redis/MQ 连接检查)
- **预期交付**:每个 service 加 readiness probe + 业务级 health check

---

## Phase B · 全栈深度 8 节 — 30 → 38

**目标**:用户强调的 Redis + RabbitMQ 深入 + 错误处理模式。

### 0031-0033 · Redis 深度(3 节)

- **用户强调**:`redis` 必修
- **覆盖**:Redis 数据结构(String/Hash/List/Sorted Set/Stream)+ 分布式锁(Redlock)+ Cache-Aside / Write-Through 模式
- **预期交付**:Cache-Aside 通用 module + 分布式锁 utility + 性能基准

### 0034-0036 · RabbitMQ 深度(3 节)

- **用户强调**:`rabbitmq` 必修
- **覆盖**:AMQP 模型 + 4 种 Exchange(direct/fanout/topic/headers)+ 死信队列 + 消息幂等性 + Consumer prefetch
- **预期交付**:通用 publisher / consumer module + DLQ 配置 + 重试策略

### 0037-0038 · 错误处理模式(2 节)

- **缺口**:retry / circuit breaker / bulkhead 全没做
- **覆盖**:指数退避重试 + 熔断器(hystrix/opossum 风格)+ 隔离(bulkhead)模式
- **预期交付**:通用 retry decorator + circuit breaker utility + 单元测试

---

## Phase C · 加分 5 节 — 38 → 43

**目标**:给想往 SRE / 性能方向走的人。

### 0039-0040 · 测试进阶(2 节)

- **覆盖**:Contract testing(Pact)+ Load testing(k6 / Artillery)
- **预期交付**:service 间 contract test 套件 + 1 个核心 endpoint 压测报告

### 0041-0042 · 监控告警(2 节)

- **覆盖**:SLO / SLI / Error Budget + Prometheus metrics 导出
- **预期交付**:每个 service 暴露 /metrics + 关键 SLI dashboard JSON

### 0043 · OpenTelemetry 链路追踪(1 节)

- **覆盖**:OTel SDK + Jaeger / Tempo 集成
- **预期交付**:5 个 service 全装 OTel + 1 个分布式 trace demo

---

## Phase D · 全栈必须补充 7 节 — 43 → 50

**目标**:nest-search 当前缺失的企业级能力(全部必修)。

### 0044-0045 · 认证/授权深入(2 节)

- **缺口**:CAS Guard 浅做,完整 OAuth 2.0 / OIDC flow 未实现
- **覆盖**:OAuth 2.0 grant types + OIDC ID Token + RBAC 模型 + CAS ticket 协议完整实现
- **预期交付**:auth-service 完整 OAuth flow + RBAC decorator + 测试

### 0046-0047 · WebSocket / SSE(2 节)

- **缺口**:nest-search 0 实时能力
- **覆盖**:@nestjs/websockets + Socket.IO + SSE 推送 + 鉴权集成
- **预期交付**:gateway 加 WS gateway + 1 个实时通知 demo

### 0048 · 文件上传 / S3 预签名(1 节)

- **缺口**:nest-search 0 文件处理
- **覆盖**:multipart upload + S3 SDK + 预签名 URL + 直传不落业务服务
- **预期交付**:通用 upload module + S3 集成 + 1 个上传 demo endpoint

### 0049 · 依赖注入 scope 进阶(1 节)

- **缺口**:NestJS request scope / transient scope 用法未深入
- **覆盖**:singleton vs request vs transient 边界 + request scope 性能代价 + AsyncLocalStorage
- **预期交付**:文档 + 1 个 request scope 实战 + 性能对比

### 0050 · API 版本控制 + 灰度发布(1 节)

- **缺口**:nest-search 单一版本,无版本管理
- **覆盖**:URI / Header / Query 3 种版本策略 + NestJS 多 controller 路由 + 灰度发布
- **预期交付**:gateway 加 /v2 前缀路由 + 1 个版本迁移 demo

---

## 跨课共性

### 每节课交付物(强制)

1. **lesson HTML**(`docs/teaching/lessons/XXXX-*.html`)
   - 5-10 节标题
   - 3 道 quiz(答案不加粗)
   - 完整 commit message 模板
   - 跨节链接到 reference 文档

2. **LR 学习记录**(`docs/teaching/learning-records/XXXX-*.md`)
   - 撞到的反模式 / 决策 / 盲点
   - Zone of proximal development 推进
   - 给后续 lesson 的输入

3. **代码改动 + commit**
   - 真实落到 nest-search 文件
   - conventional commits 风格
   - 18 测试还过(回归安全网)

### 4 条 lesson 设计铁律(从副线 1+2 撞出来的)

1. **lesson 代码先跑通再写 HTML**(改 → 跑 → 故意改坏验证 → 写 HTML → commit)
2. **基础设施改动单独成 §X.0**("准备"章节讲清依赖 / 配置 / 工具链)
3. **第三方 API 标版本号**(避免 import 语义变化)
4. **quiz 不加粗答案**(0 加粗,data-correct + JS 反馈)

### 工作流(2026-06-22 起)

- **lesson HTML** 由 Claude 写(纯指南)
- **业务代码** 由 user 写(learn-by-doing)
- **Claude**:解释概念 + 设计决策 + 卡住时给提示 + 写 LR + commit message
- **user**:写代码 + 跑测试 + commit
- **不再有"我替你写完"的伪动手**

---

## 进度追踪

| 阶段 | 节数 | 状态 | 完成日期 |
|---|---|---|---|
| 已完成 | 18 | ✅ | 2026-06-22 |
| Phase A | 12 | ⏳ 待开 | — |
| Phase B | 8 | ⏳ 待开 | — |
| Phase C | 5 | ⏳ 待开 | — |
| Phase D | 7 | ⏳ 待开 | — |
| **总计** | **50** | **18/50 = 36%** | — |

---

## 下一个动作

按上述顺序,**0019-0021 Zod 配置校验** 是 Phase A 第 1 个 + 用户强调主题 + MISSION 缺口,**立刻可开**。

确认开 0019?或对大纲有调整?
