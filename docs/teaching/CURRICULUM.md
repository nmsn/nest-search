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
| Redis/BullMQ/Zod/Drizzle 全是"用过但未深入" | 进 Phase A / B 必修 |
| Docker 0 课时(MISSION out-of-scope 边缘) | 进 Phase C 加分,非必修 |
| 测试 / 健康检查 / 错误处理"浅做" | 全部进 Phase A 必修 |

---

## 总体节奏(18 已用 + 32 待开)

```
主线(8) → principles(4) → 副线1 测试(3) → 副线2 迁移(3)
         [已用 18]
                                              ↓
              Phase A 必修 12 → Phase B 深度 11 → Phase C 加分 5 → Phase D 全栈 7 → Phase E DB 架构 6
              [0019-0030]      [0031-0041]      [0042-0046]      [0047-0053]      [0054-0059]
              [30 节总目标]     [41 节]          [46 节]          [53 节]          [59 节]
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

### 0027 · JWT 深入(1 节)

- **缺口**:LR-0002 #7(CasGuard 浅做,JWT 流程不完整)
- **覆盖**:AT 黑名单(jti + Redis)+ CAS_CONFIG → ConfigService + 双令牌架构 + 签名验证原理
- **交付**:auth.service.ts AT 即时吊销 + auth.controller.ts ConfigService 改造 ✅

### 0028 · 健康检查深度(1 节)

- **缺口**:LR-0002 #3(terminus 浅做)
- **覆盖**:liveness vs readiness + 自定义 indicator(数据库/Redis 连接检查)+ Docker Compose / k3s 配置
- **交付**:auth-service health module + /health/live + /health/ready ✅

### 0029 · Swagger API 文档(1 节)

- **缺口**:nest-search 5 个 service 无 API 文档,前端对接靠口头沟通
- **覆盖**:OpenAPI 3.0 规范 + @nestjs/swagger + 装饰器(@ApiProperty/@ApiResponse/@ApiTags)
- **预期交付**:auth-service 装 Swagger + /api/docs 可访问

### 0030 · CORS + 安全头 + 请求限制(1 节,Phase A 收官)

- **缺口**:auth-service CORS 全开,无 Helmet,无 body 大小限制
- **覆盖**:CORS 精确配置(按环境区分)+ Helmet 安全头 + 请求体大小限制
- **预期交付**:auth-service 安全配置完善

---

## Phase B · 全栈深度 19 节 — 30 → 49

**目标**:用户强调的 Redis + BullMQ 深入 + Elasticsearch(基础 + 企业级)+ 错误处理模式。

### 0031-0033 · Redis 深度(3 节)

- **用户强调**:`redis` 必修
- **覆盖**:Redis 数据结构(String/Hash/List/Sorted Set/Stream)+ 分布式锁(Redlock)+ Cache-Aside / Write-Through 模式
- **预期交付**:Cache-Aside 通用 module + 分布式锁 utility + 性能基准

### 0034-0036 · BullMQ 深度(3 节)

- **用户强调**:`bullmq` 必修(替代 RabbitMQ,BullMQ 基于 Redis,项目已有 Redis)
- **覆盖**:BullMQ 核心概念(Queue/Worker/Job)+ 重试策略(attempts + backoff)+ 延迟任务 + 优先级队列 + 限流 + 事件监听
- **预期交付**:通用 Queue/Worker module + 重试配置 + 任务状态监控

### 0037-0039 · Elasticsearch 基础(3 节)

- **缺口**:search-service 已用 ES,但没有教学;用户要求讲解功能 / 语法 / 性能 / 对比
- **覆盖**:ES 核心概念(Index/Document/Mapping/Analyzer)+ Query DSL(must/filter/should/aggs)+ 倒排索引原理 + 与 PostgreSQL FTS / MongoDB / Solr 对比 + 基础性能
- **预期交付**:search-service 查询优化 + 1 个聚合查询 demo + 性能对比报告

### 0040-0047 · Elasticsearch 企业级(8 节)

> **来源**:用户要求 ES 技能学到能写简历。围绕 nest-search 实际业务:**同步全量数据 → 索引 → 前端查询**。
> **不涉及**:向量搜索 / RBAC / 多集群 / CCR(单租户 dev 项目用不到)。

- **项目搜索本质**:商品目录检索（非语义搜索）。用户通过分类/brand/价格过滤出商品集合，排序以量化字段为主
- **覆盖**:
  - **0040** 中文分词:IK 插件安装 + 自定义词典 + pinyin
  - **0041** 零停机重建:Alias 切换 + reindex 蓝绿
  - **0042** 深度分页:search_after + PIT 替代 from+size
  - **0043** 关键词搜索调优:BM25 explain(排查搜不到/搜不准) + 多字段权重 + categoryId 目录字段
  - **0044** 聚合实战:categoryId 子目录聚合 + terms + stats（商品目录筛选核心）
  - **0045** 索引生命周期:ILM policy + 滚动索引
  - **0046** 慢查询调优:Profile API + slowlog + query 改写
  - **0047** 高亮 + Suggest:highlight + completion/phrase suggest
- **预期交付**:
  - docker-compose 加 IK 插件镜像
  - search-service: alias / search_after / categoryId 过滤 / highlight / suggest
  - sync-service: 滚动索引写入
  - 慢查询中间件 + 日志
  - ILM policy 配置
- **学完技能**:**中高级 ES 工程师**,能独立负责千万级商品目录搜索系统

### 0048-0049 · 错误处理模式(2 节)

- **缺口**:retry / circuit breaker / bulkhead 全没做
- **覆盖**:指数退避重试 + 熔断器(hystrix/opossum 风格)+ 隔离(bulkhead)模式
- **预期交付**:通用 retry decorator + circuit breaker utility + 单元测试

---

## Phase C · 加分 5 节 — 49 → 54

**目标**:给想往 SRE / 性能方向走的人。

### 0050-0051 · 测试进阶(2 节)

- **覆盖**:Contract testing(Pact)+ Load testing(k6 / Artillery)
- **预期交付**:service 间 contract test 套件 + 1 个核心 endpoint 压测报告

### 0052-0053 · 监控告警(2 节)

- **覆盖**:SLO / SLI / Error Budget + Prometheus metrics 导出
- **预期交付**:每个 service 暴露 /metrics + 关键 SLI dashboard JSON

### 0054 · OpenTelemetry 链路追踪(1 节)

- **覆盖**:OTel SDK + Jaeger / Tempo 集成
- **预期交付**:5 个 service 全装 OTel + 1 个分布式 trace demo

---

## Phase D · 全栈必须补充 7 节 — 54 → 61

**目标**:nest-search 当前缺失的企业级能力(全部必修)。

### 0055-0056 · 认证/授权深入(2 节)

- **缺口**:CAS Guard 浅做,完整 OAuth 2.0 / OIDC flow 未实现
- **覆盖**:OAuth 2.0 grant types + OIDC ID Token + RBAC 模型 + CAS ticket 协议完整实现
- **预期交付**:auth-service 完整 OAuth flow + RBAC decorator + 测试

### 0057-0058 · WebSocket / SSE(2 节)

- **缺口**:nest-search 0 实时能力
- **覆盖**:@nestjs/websockets + Socket.IO + SSE 推送 + 鉴权集成
- **预期交付**:gateway 加 WS gateway + 1 个实时通知 demo

### 0059 · 文件上传 / S3 预签名(1 节)

- **缺口**:nest-search 0 文件处理
- **覆盖**:multipart upload + S3 SDK + 预签名 URL + 直传不落业务服务
- **预期交付**:通用 upload module + S3 集成 + 1 个上传 demo endpoint

### 0060 · 依赖注入 scope 进阶(1 节)

- **缺口**:NestJS request scope / transient scope 用法未深入
- **覆盖**:singleton vs request vs transient 边界 + request scope 性能代价 + AsyncLocalStorage
- **预期交付**:文档 + 1 个 request scope 实战 + 性能对比

### 0061 · API 版本控制 + 灰度发布(1 节)

- **缺口**:nest-search 单一版本,无版本管理
- **覆盖**:URI / Header / Query 3 种版本策略 + NestJS 多 controller 路由 + 灰度发布
- **预期交付**:gateway 加 /v2 前缀路由 + 1 个版本迁移 demo

---

## Phase E · 企业级数据库架构 6 节 — 61 → 67(2026-06-24 新增)

> **来源**:用户要求"教企业级数据库高并发 / 分库分表 / 微服务 + 改造项目"。
> **参考文档**:`docs/teaching/reference/enterprise-database-architecture.md`(必读前置)。
> **目标**:把 nest-search 从"教学 demo"改造为"接近企业级生产"的样板,聚焦架构层(非 API 层)。

### 0062 · 外键禁用 + 业务一致性

- **缺口**:nest-search schema 已无 FK(0023 验证),但**应用层一致性检查缺失**;无软删除兜底
- **覆盖**:禁用 FK 的 5 个理由(性能 / 锁 / 分库 / 微服务 / 恢复);5 种替代方案(应用层校验 / 软删除 / 定期对账 / Outbox / Saga)
- **预期交付**:`cas_tickets.userId` 显式无 FK 注释 + service 层 `userService.exists(id)` 校验 + `users.deleted_at` 字段 + 1 个 e2e 测孤儿 ticket

### 0063 · 高并发 + 连接池调优

- **缺口**:pg pool 用默认值,无显式配置;没演示过 EXPLAIN ANALYZE 在高并发场景
- **覆盖**:PostgreSQL server 端(`max_connections` / `shared_buffers` / `work_mem` / `statement_timeout`) + 应用层 pg.Pool 配置 + 实战 EXPLAIN ANALYZE
- **预期交付**:`drizzle.service.ts` 显式 Pool config + k6 / autocannon 压测 register endpoint + 报告

### 0064 · 缓存策略(Cache-Aside)

- **缺口**:Redis (ioredis) 已装但只用于限流;DB cache 空白
- **覆盖**:Cache-Aside / Write-Through / Write-Behind / Read-Through 4 模式 + 3 大坑(穿透 / 雪崩 / 击穿)
- **预期交付**:`UserService.findById` 加 Cache-Aside(Redis, TTL 5min) + 处理 3 大坑

### 0065 · 分库分表(水平 + snowflake)

- **缺口**:5 service 已垂直分库,但无水平分表演示;auto_increment ID 在分表后不连续
- **覆盖**:水平分表 3 策略(Hash / Range / Time) + sharding 中间件对比 + snowflake ID
- **预期交付**:`cas_tickets` 模拟水平分表(`userId % 2` → 2 个 DB) + snowflake-like ID 生成器 + 应用层 router

### 0066 · 分布式事务(Outbox 模式)

- **缺口**:跨 service 副作用无事务保护(0023 LR 提的"非事务性副作用"问题)
- **覆盖**:4 种方案对比(2PC / TCC / Saga / Outbox) + Outbox 实现 + worker 处理 + 幂等性
- **预期交付**:`outbox` 表 + `createUserWithOutboxEvent` 事务方法 + Cron worker 推 BullMQ(已有 bull)

### 0067 · 微服务 Database per Service

- **缺口**:form-service / sync-service 跟 auth 共享 DB(反模式);sync-service 通过 schema-factory 动态生成表(共享 DB 池)
- **覆盖**:Database per Service 原则 + 5 种跨服务数据访问模式 + nest-search 现状盘点
- **预期交付**:form-service 拆独立 DB(`nest_search_form`) + sync-service 拆独立 DB(`nest_search_sync`) + 跨 service 数据走 API Composition

### Phase E 共性

- **每次都有"现状 → 改造 → 验证"3 段式**
- **不引入新中间件**(ShardingSphere / Vitess 都是 Java 生态;nest-search 是 Node,演示用应用层手写)
- **每个改动跑 `pnpm test` 验证不破窗**
- **如果 nest-search 改不动**(比如 form/sync 拆 DB 影响太大),**降级为 lesson 内的 design exercise**(不动代码,只产出迁移方案文档)

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
| 已完成(主线+副线+Phase A 0019-0028) | 28 | ✅ | 2026-06-25 |
| Phase A 余下 (0029-0030) | 2 | ⏳ | — |
| Phase B (Redis+BullMQ+ES 基础) | 11 | 🟡 5/11 | 2026-06-28 |
| Phase B' (ES 企业级 0040-0047) | 8 | ⏳ 新增 | — |
| Phase B 错误处理(0048-0049) | 2 | ⏳ | — |
| Phase C (0050-0054) | 5 | ⏳ | — |
| Phase D (0055-0061) | 7 | ⏳ | — |
| **Phase E(企业级 DB 架构 0062-0067,2026-06-24 新增)** | **6** | **⏳** | — |
| **总计** | **67** | **33/67 = 49%** | — |

---

## 下一个动作

按 2026-06-25 校准:
1. **0029 lesson 已就绪** — Swagger API 文档
2. **0030 lesson 已就绪** — CORS + 安全头 + 请求限制
3. Phase A 还剩 0029-0030,完成后进入 Phase B (0031 Redis 深度)

**下一步**:用户执行 0029 lesson。
