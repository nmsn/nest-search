# 0002 — `nest-search` 现状盘点(用于"边学边改")

> 不是项目功能描述,只是 backend best practices 视角下的"有什么 / 没有什么"清单。

## 已有(green)
- NestJS 11 monorepo,5 个后端 app(gateway / auth / search / form / sync)+ `libs/shared` 库
- pnpm workspace,`nest-cli.json` 已配好 monorepo
- 基础设施: Docker Compose 起 MySQL 8 / Elasticsearch 8.12 / BullMQ 3-management / Redis 7
- Gateway: API Key Guard + CAS Guard + AllExceptionsFilter + ProxyService(已落到 `apps/gateway/src/`)
- auth-service: ConfigModule(global) / DrizzleModule(global) / RedisModule(global) / ValidationPipe(whitelist + transform) / cookie-parser / CORS
- 数据层: Drizzle ORM + mysql2 + drizzle-kit 已装
- 消息: amqp-connection-manager + bull(用于 sync-service)
- 缓存: ioredis 已装并抽象为 RedisService
- 搜索: `@elastic/elasticsearch` 8.19 + `SearchModule` 用 `onModuleInit` 初始化索引
- 测试: jest + ts-jest + @nestjs/testing 已装,**但 `apps/*/src/**/__tests__` 几乎为空**

## 缺位(red — 候选教学任务)
1. **结构化日志**: 全是 `console.log`,没有 Pino,没有 request id,生产排障会瞎
2. **全局异常过滤器**: gateway 里有,但只覆盖了 500 + HttpException,没有把 `unhandledRejection` / 业务异常分类
3. **健康检查**: 没有 `@nestjs/terminus`,Docker / K8s liveness/readiness 没法写
4. **API 文档**: 没有 `@nestjs/swagger`,前端同事要对着 controller 源码猜字段
5. **限流**: 没有 `@nestjs/throttler`
6. **统一配置校验**: ConfigModule 没接 Joi/Zod,`process.env` 直接读,启动时不会爆但运行时会
7. **JWT 策略**: 看到 `CasGuard` 但没看到 `@nestjs/jwt` 接入,登录后怎么续签 / 怎么校验没串起来
8. **测试**: 一行测试都没有,改任何东西都是裸奔
9. **优雅退出**: 没有 `enableShutdownHooks`,SIGTERM 来时 BullMQ 连接会半挂
10. **链路追踪**: 没有 OpenTelemetry,跨服务调用定位困难

**Implications**:
- 第一阶段"可观测性三件套"对应 1+2+3(+4 作为赠品,Swagger 在企业里算"可观测性"的延伸 — 没有文档等于不可观测)
- LR-0003 起,每节 lesson 应同时给出"读哪段代码"和"改哪段代码",避免纯讲理论
- 这条记录会被多次 supersede,每次完成一组补底就更新
