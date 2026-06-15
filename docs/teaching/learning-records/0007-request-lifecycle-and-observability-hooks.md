# 0007 — NestJS 请求生命周期 + 三个真实工程坑

## 0004 验证全过(5/5)

1. ✅ `[Lifecycle] OnModuleInit` 启动时触发
2. ✅ 不带 X-API-Key curl /health 返 200(LR-0003 的 401 修掉了 — 用 @Public() 装饰器)
3. ✅ 带 X-API-Key 走通业务(回 401 因为账号不存在,但链路完整)
4. ⚠️ 业务请求代理链路通,但 TimingInterceptor 在 401 路径**漏**了(原因见下)
5. ✅ SIGTERM 触发 `[Lifecycle] OnModuleDestroy` + `[Lifecycle] OnApplicationShutdown: signal=SIGTERM`

## 0004 quiz 3/3(连续第二次全对)

| 课时 | 结果 | 错题 |
|---|---|---|
| 0001 | 2/3 | poll 阶段 |
| 0002 | 2/3 | unhandledRejection 退出方式 |
| 0003 | 3/3 | — |
| **0004** | **3/3** | — |

模式定型: 早期错的是"Node 具体行为 vs 术语直觉",现在不犯了。装饰器 / Reflector / 性能 API 这类新概念,接收效率高。

## 三个**真实工程坑**(都会影响后面课程)

### 坑 1:对比实验忘了还原 → lifecycle 钩子全失效

**现象**: 0003 §5.4 当时为了演示"硬死",把 `app.enableShutdownHooks()` 注释掉做对比。实验做完后**没取消注释**,导致 0004 跑 SIGTERM 时 lifecycle 日志全无。

**教训**: 任何"临时改回去看效果"的实验,做完必须立刻恢复。或者用 git 暂存:`git stash` 改前状态 → 改 → 测 → `git stash pop` 恢复。

**debug 路径**: `grep "enableShutdownHooks" main.ts` 是最快定位 — 一眼看出被注释了。

**Implications**: LR-0006 提过"3 节课都在装原本关闭的钩子" — 这类"显式 opt-in"的开关一多,就特别容易"忘了开"。后续课程凡涉及 enable* / register* / forRoot* 这类"显式激活"的 API,都要在 commit message 里写明"激活了什么"。

### 坑 2:TimingInterceptor 用 `tap()` 在异常路径漏

**现象**: 业务请求 401 时,`[Timing]` 日志**没打**,只有 `[AllExceptions]`。

**原因**: `tap()` 的 next 回调只在 Observable 成功 next 时执行。Handler throw 之后,Observable 走 error 状态,tap 跳过。

**修法** (0005 替换 TimingInterceptor 时): 用 `finalize` 替代 `tap` — 无论 next/error/complete 都执行。同时**在响应里加 statusCode**,这样日志能区分 200 / 4xx / 5xx。

**修法示意**:
```ts
return next.handle().pipe(
  finalize(() => {
    const ms = (performance.now() - start).toFixed(2);
    const status = context.switchToHttp().getResponse().statusCode;
    console.log(`[Timing] ${req.method} ${req.url} ${status} ${ms}ms`);
  }),
);
```

### 坑 3:AllExceptionsFilter 把 4xx 当异常刷屏

**现象**: 业务 401 / 400 也走 Filter 路径,`[AllExceptions]` 把所有非 2xx 都打 stack。

**修法** (0005/0006): Filter 里加判断 — 只在 `statusCode >= 500` 时打 log,4xx 直接 return(或者打 info 级而不是 error 级)。这是行业标准做法。

## 0004 顺带验证的两条"分布式追踪痛"

| 现象 | 暴露的问题 |
|---|---|
| gateway 日志里只有 `[AllExceptions] Invalid credentials` | 看不出"这个 401 是不是因为 DB 慢 / 因为连接池满 / 因为下游崩了" — 因为 auth-service 的日志在另一个进程 |
| proxy 转发 4xx/5xx 没有 requestId 关联 | 一次请求产生 N 个进程 × M 条日志,排查时只能凭时间戳猜 |

**Implications for 0005**:
- 0005 要给所有日志加 `requestId` 字段(用 `AsyncLocalStorage` 传递,确保同一请求的所有日志共享 ID)
- 0005 要让 TimingInterceptor 升级到 `finalize` + 加 statusCode
- 0005/0006 要让 AllExceptionsFilter 只 log 5xx
- 0005 的核心交付物是 **Pino LoggerService** 替代散落的 `console.log/error`,所有日志走 pino,JSON 格式,字段化可检索

## 跨节共性模式(已成型)

四节课下来,出现了一个稳定的 backend 范式:

```
框架默认: 把"日志 / 鉴权 / 错误处理 / 生命周期"全关掉
        ↓ 你必须显式开
显式 opt-in: console.log → pino / 无 auth → @UseGuards / 硬死 → enableShutdownHooks / 无校验 → @UsePipes
        ↓ 然后挂自己的实现
挂载 hook: tap → finalize / @SetMetadata + Reflector / @Public() 装饰器 / OnModuleInit + OnModuleDestroy
        ↓ 最后用"可观测"检验
检验手段: 启动日志 / curl 200 vs 401 / SIGTERM 日志 / 跨进程 grep requestId
```

**后端跟前端的根本不同**: React/前端框架"开箱有大量默认行为"(`console.log` 浏览器自动收集、Vite HMR 自动 reload、DevTools 自动 trace);NestJS"默认关,要自己装"。这就是为什么 backend 工程师看起来在"配更多东西" — 他们在接线,但每根线都有理由。
