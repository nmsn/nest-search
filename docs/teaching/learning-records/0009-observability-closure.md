# 0009 — 可观测性收官 + Swagger(可观测性三件套正式完成)

## 0006 收口观察

- ✅ /health 从"return ok"升级为真检测(HttpHealthIndicator ping auth-service + MemoryHealthIndicator check heap)
- ✅ liveness (`/health/live`) vs readiness (`/health`) 分离 — K8s 不会因为下游抖一下就无限重启
- ✅ Swagger UI 在 `/api`,OpenAPI JSON 在 `/api-json`
- ✅ 20 个 handler 全部加 `@ApiOperation` + `@ApiResponse` + `@ApiParam`
- ✅ 3/3 quiz(连续 4 节 3/3)

## 关键心智模型

"可观测性三件套" 在 6 节课里陆续落地:

```
0001  Node 运行时              ← 知道 Node 怎么动
0002  错误处理三层防御         ← 知道错误怎么"露"
0003  进程生命周期             ← 知道进程怎么"死"
0004  NestJS 请求生命周期      ← 知道请求怎么"流"
0005  Pino 结构化日志         ← 知道日志怎么"查"
0006  收官: 健康检查 + 文档     ← 让运维和前端都能"看见"
```

三层防御 + 完整 lifecycle + 结构化日志 + 真检测 / 文档,合起来是 backend service 的"基础设施"。

## 5.7 关键验证(lesson 强调的)

5.7 步骤 2 是 "**停掉 auth-service 看 /health 返 503**" — 这是 backend oncall 价值的体现:
- happy path 200 → "好"没什么信息
- 出问题路径 503 → **真的知道系统在检测依赖**,而不是假装健康

## API 文档化的两个对比

| 之前 | 之后 |
|---|---|
| 前端"对着 controller 猜字段" | Swagger UI 列所有字段 + 类型 + 必填 |
| 字段名错就线上 bug | 前后端契约明确(OpenAPI spec 单一来源) |
| 改 endpoint 要通知前端 | 改 controller 注解自动同步到 docs |

## Implications for 0007

0007 是"限流与安全" — `@nestjs/throttler` 装上,防止 gateway 被恶意请求刷爆:
- 装上后每个 IP 每分钟最多 N 个请求
- 可以按 endpoint / 用户 / 业务线配置不同限额
- 跟现在的 ApiKeyGuard 配合:认证通过后还有"额度",未认证直接被限

**前置依赖**: 0006 装的 `@nestjs/terminus` 让 `/health` 真在检查,意味着 K8s 看到 service unhealthy 会自动摘 endpoint;0007 装限流后,如果服务被刷爆,throttler 会自动 429 响应,**配合** terminus 一起形成"主动拒绝 + 主动告警"的闭环。

## 跨节共性

6 节课出现的最大共性:**所有"开关"都默认关闭**。backend 跟前端的最大不同:框架给你所有"接线"点,但默认不上电 — `@types/*`、`enableShutdownHooks`、`@Public()`、`LoggerModule.forRoot`、`enableShutdownHooks`、`@nestjs/terminus`、`@nestjs/swagger` 都是这个模式。

## 关键 stat

6 节课下来:
- 7 次 commit
- 35+ 个文件改动
- 4 个 quiz 满分(连续 4 节 3/3)
- 暴露 + 修复 8+ 个真实工程坑

模式成熟: 学员(你)从"理解错"到"理解对"到"判断是否做"的轨迹完整。"是否做"这一步是新加的 — 0005 keep-alive 那次,学员主动选 C 路线"守主题 + 记 follow-up",这是从执行者到设计者的跨越。
