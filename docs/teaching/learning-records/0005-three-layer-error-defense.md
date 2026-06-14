# 0005 — 三层错误防御 + 0002 实战观察

## 核心心智模型

NestJS 应用里,一个错误"会到哪一层处理"取决于**它从哪条家族 + 哪条路径产生**:

| 产生位置 | 错误家族 | 被谁接 | 备注 |
|---|---|---|---|
| Controller / Service 同步代码 | sync throw | `AllExceptionsFilter` | 走 NestJS 异常管道 |
| 任何 await / .then 链 | Promise reject (有 .catch) | try/catch / .catch | 走开发者写的错误处理 |
| 任何 await / .then 链 | Promise reject (无 .catch) | `process.on('unhandledRejection')` | 框架看不见 |
| setTimeout / EventEmitter / 第三方内部 | sync throw | `process.on('uncaughtException')` | 框架看不见 |

## 实战观察(0002 hands-on)

- **路径 1(sync throw)**: 第一次 curl 拿到 401 而不是 500,原因是 `ApiKeyGuard` 在 handler 之前运行;加 `X-API-Key` 头绕过 guard 后才看到 500 + `[AllExceptions]` 日志
- **路径 2(Promise reject 无 catch)**: 拿到 200 + `[unhandledRejection]` 日志。**HTTP 200 跟"服务器没坏"是两件事** — 这是 lesson 最有价值的发现
- **路径 3(干净基线)**: 200 + 干净控制台,确认两个钩子和 filter 的日志都是"按需触发",不会刷屏

## 0002 quiz 错题与澄清

- Q1 错(选 c"自动 throw 到主线程")。正确: Node 把 unhandledRejection 打到 stderr,下一次 tick 调 `process.exit(1)`。`--unhandled-rejections=throw` 这个 flag 名字里的"throw"指退出机制,不是同步抛到主线程
- 跟 0001 Q1 错的模式一致:**Node 的"实际行为"跟用户对术语的直觉有 1-2 步的偏差**。这种偏差是这套课程要持续补的洞

## 0002 产生的代码 deliverable

- `apps/gateway/src/main.ts` — 加 2 个 `process.on` 钩子(只 log,不 exit)
- `apps/gateway/src/filters/all-exceptions.filter.ts` — 加 1 行 `console.error('[AllExceptions]', exception)`

## Implications for next sessions

- 0003 要解决路径 2 的"HTTP 200 但服务流血"问题:用 Pino 把 `[unhandledRejection]` 升级成结构化日志 + 给 `Logger` 配 requestId 关联
- 0004 要解决路径 1 的"Guard 截胡让 throw 不可见"问题:用 `@Public()` 装饰器让 `/health` 跳过 ApiKeyGuard,这样 K8s probe 不带 X-API-Key 也能过
- 0006 要解决 `AllExceptionsFilter` 把整个异常吞成"Internal server error"的问题:把 `exception` 的 message 透传出来(现在 21-22 行的 `message`/`error` 字段在 HttpException 分支是对的,但在其它分支会丢失 stack 摘要)

## 跨节共性模式(开始出现的)

两节课都在强化一个"backend 范式": **能用框架默认的就用框架默认;非默认不可的,要显式 log 出去。** Node 不会像浏览器那样有 devtools 帮我们看,所有"看不见的事件"都要我们主动 log。
