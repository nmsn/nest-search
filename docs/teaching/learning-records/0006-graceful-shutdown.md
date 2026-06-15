# 0006 — 软死 vs 硬死 + 0003 收口观察

## 核心心智模型

K8s 给 Pod 30 秒软死时间窗(SIGTERM → SIGKILL),你必须显式装 `app.enableShutdownHooks()` 才能在窗口期内跑 cleanup 钩子。**没装它 = 收到 SIGTERM 立即死** = in-flight 请求被打断, RabbitMQ/Redis/MySQL 连接硬切,等 30 秒后 K8s 兜底 SIGKILL 二次伤害。

## 4 阶段有序退出顺序(在 §4 跟 §5.4 跑通过)

```
SIGTERM/SIGINT 收到
    ↓
OnModuleDestroy     (依赖逆序,关连接层)
    ↓
beforeApplicationShutdown   (应用级,关定时器)
    ↓
HTTP server 停接新请求   (NestJS 内部)
    ↓
OnApplicationShutdown (signal 参数传进来,刷日志/释放文件句柄)
    ↓
process.exit(0)
```

## 0003 实战观察

- **5.4 第一次验证**: 装上 `enableShutdownHooks` 后,`kill -SIGTERM <pid>` 控制台按顺序打印两条 `[Lifecycle]` 日志,然后进程退出码 0
- **5.4 对比实验**: 注释掉 `enableShutdownHooks`,再次 `kill -SIGTERM`,gateway 立即死,没有 [Lifecycle] 日志 — **直接证明钩子是被 `enableShutdownHooks` 激活的**,不是被自动触发
- **quiz 3/3** — 用户首次全对,说明 "Node 实际怎么动" 的直觉 + "K8s 概念" 同步到位

## Implications for next sessions

- 0004 NestJS 请求生命周期会用到 `OnModuleInit`(`LifecycleProbeService` 可以再加一个 `OnModuleInit` 做对照,展示完整的 init/destroy 对称)
- 0005 Pino 结构化日志要把 `[Lifecycle] OnApplicationShutdown: signal=SIGTERM` 改成结构化 JSON + 给 `lifecycle` 加 logger 命名空间
- 0006 healthcheck / Swagger 要在 `readinessProbe` 上做正确实现(就是 0001 提到的 401 误伤),把 `/health` 改成不需要 API key
- **跨节共性**: 三节课都在"装上原本关闭的钩子" — `@types/*`、`enableShutdownHooks`、`@Public()` 装饰器都是这个模式。这是 backend 跟前端一个很大的不同:**框架给了你所有"接线"点,但默认不上电,你要自己开**。

## 教学小观察:三节课的错误模式

| 课时 | 错题 | 错在哪一类 |
|---|---|---|
| 0001 | poll 阶段 = 等 | Node 实际行为 vs 术语直觉 |
| 0002 | unhandledRejection = 同步 throw | Node 实际行为 vs flag 命名直觉 |
| 0003 | (无) | 全部答对 |

模式出现: 用户错的都是"Node 的具体行为跟我的常识有微妙偏差"的问题。这其实是好事 — 错的针对性很强,等 0007/0008 涉及更深的底层(microtask 顺序、EventEmitter 内存泄漏、stream backpressure)时,这些"基础直觉偏差"会被持续打补丁,不会再成片错。
