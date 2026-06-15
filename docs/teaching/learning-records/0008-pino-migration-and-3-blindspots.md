# 0008 — Pino 迁移 + 四个 lesson 盲点

## 核心心智模型

`console.log` 不可索引、不可 grep、不可告警;Pino 把日志从字符串升级成**字段化的 JSON**,加 `requestId` 跨函数/跨服务串接,生产排查从"翻 console 赌运气"变成"grep 一个 ID 看完整链路"。

## 0005 验证全过 + 3/3 quiz(连续 3 节)

| 课时 | 结果 |
|---|---|
| 0001 | 2/3 |
| 0002 | 2/3 |
| 0003 | 3/3 |
| 0004 | 3/3 |
| **0005** | **3/3** |

三个 3/3 = "Node 行为 + NestJS 装饰器 + 可观测性基础设施" 全部在线。

## 四个 lesson 盲点(都补进下次开课扫描清单)

### 盲点 1:任何用 `new Logger(X.name)` 的地方都得迁

`@nestjs/common` 的 `Logger` 是 NestJS 自带 logger,会打 `[Nest] [ClassName] message` 到 stdout,跟 Pino 完全是两套:
- 格式不一样(`[Nest]` 前缀 vs Pino JSON)
- 不能被 nestjs-pino 的 auto-request-id 关联
- 不能用 `customProps` 注入业务字段

**修法**:
```ts
// 之前
import { Logger } from '@nestjs/common';
private readonly logger = new Logger(ProxyService.name);
this.logger.log('...');

// 之后
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
constructor(@InjectPinoLogger(ProxyService.name) private readonly logger: PinoLogger) {}
this.logger.info('...');
```

**未来 lesson 扫描清单**:
```bash
grep -rn "new Logger(" apps/  # 任何匹配都得改
```

### 盲点 2:`pino-http` 的 auto log 默认开启

`nestjs-pino` 在 pino-http 之上,pino-http 默认会**每个 HTTP 请求都打一条 "request completed"**(含 method/url/statusCode/durationMs)。如果同时装了 `TimingInterceptor` 做同样的事,**会重复打两遍**。

**修法**:在 `LoggerModule.forRoot({ pinoHttp: { ... } })` 加 `autoLogging: false`。然后 TimingInterceptor 是唯一访问日志源。

**未来 lesson 提示**:lesson 文档应明确说"我们自己有 TimingInterceptor,所以关 pino-http auto log",而不是让用户从观察重复日志反向发现。

### 盲点 3:`finalize()` 读 `response.statusCode` 时机不对

`finalize` 在 observable 完成(throw 或 next)时**同步触发**,**早于** AllExceptionsFilter 接管请求并设置 `response.statusCode`。所以读到的 statusCode 是中间态(可能是默认值 200,或者 Express 的某个内部状态值 201)。

**修法**:用 `res.on('finish')` 替代 `finalize`,这个事件在响应**完全发完后**才触发,`res.statusCode` 一定是最终值。

```ts
// 之前
return next.handle().pipe(
  finalize(() => {
    const statusCode = response.statusCode;  // ⚠️ 可能不是最终值
  }),
);

// 之后
res.on('finish', () => {
  const statusCode = res.statusCode;  // ✅ 一定是最终值
});
return next.handle();
```

**未来 lesson 提示**:任何"读取 response 状态"的代码都应该在 `res.on('finish')` 里,不在 `finalize` 里。

### 盲点 4:`throw error.response.data` 是反模式

axios 抛 `AxiosError` 时,`error.response.data` 是下游返回的 JSON body。直接 `throw` 这个 body 是 bug:
- 它不是 `HttpException`,filter 没法从它取 status
- filter 默认 500(Internal Server Error),丢了真实状态码
- 4xx 走不到 debug 分支(因为 500 >= 500),会刷屏

**修法**:
```ts
// 之前
throw error.response.data;   // 抛普通对象

// 之后
throw new HttpException(
  error.response.data,
  error.response.status,     // ✅ status 从 axios 拿
);
```

**为什么这是常见错**:前端出身的 dev 习惯把"response body 整个 throw 出去",后端框架期望的是 "HttpException with status code"。这个差异就是后端思维的一个小但关键的台阶。

## 跨节共性模式(5 节课,4 个模式成型)

```
1. "显式 opt-in": 框架默认关,你要自己开
   - @types/*, enableShutdownHooks, @Public, LoggerModule.forRoot
2. "Throw 之前确认类型":  throw HttpException,不是 throw error.response.data
3. "读取状态用 res.on('finish')": 不是 finalize
4. "新增 hook 默认是 ad-hoc,不是全局": 改完要立刻迁移所有同模式(grep new Logger()/grep @UseGuards)
```

## Implications for 0006

- 0006 是"可观测性收官" + "API 文档"
- 收官两件: ① 把 `/health` 改成 `@nestjs/terminus` 真正的健康检查(DB / Redis / 下游服务 ping) ② 把 ApiKeyGuard 的 `businessLine` 校验日志化(Pino)
- API 文档: 用 `@nestjs/swagger` 给所有 controller 加 `@ApiOperation` / `@ApiResponse`,启动 Swagger UI
- 下次开课前**先扫一遍 `apps/` 下所有 `new Logger(`**,确保不会再撞盲点 1

## 关键 stat

5 节课下来:
- 7 次 commit
- 25+ 个文件改动
- 3 个 quiz 满分
- 暴露 + 修复 6+ 个真实工程坑(/health 401、对比实验忘还原、[Timing] tap 漏、AllExceptionsFilter 4xx 刷屏、throw error.response.data、[Nest] [ProxyService] 噪音、pino-http autoLogging 重复、finalize 时机)

每次 lesson 都比上次更深的"真后端"问题,模式从"语法错"转向"框架默认行为错"再转向"工程惯例错"。这正是从高级前端到 T 形工程师要走的路。

## Known follow-up(留给 0009 或单独 commit)

0005 验证时,SIGTERM 之后 `onApplicationShutdown` 没打出来,但 `onModuleDestroy` 打出来了。

**根因**: NestJS 关闭序列是 `onModuleDestroy → beforeApplicationShutdown → dispose → onApplicationShutdown`。`dispose()` 调 `httpServer.close()`,但 Node 18+ 的 `close()` **只停止接受新连接,不断 keep-alive 连接**。如果之前 curl 留下的 keep-alive 连接还在,dispose 永远不返回,onApplicationShutdown 永远不触发。

**修法**(不在 0005 commit 里):
```ts
// main.ts, app.listen 之后
const server = app.getHttpServer();
server.keepAliveTimeout = 1000;   // 1 秒,生产也建议调
```

**为什么是独立 issue**: keep-alive 调优是 backend 工程的标配,但跟"结构化日志"主题无关,放在 0005 commit 会偏题。0005 commit 只锁 Pino 相关改动,follow-up 单独一个 `fix:` 或 `chore:` commit。

**Lesson 0.5 lesson 设计的反思**: 我下次写 lesson 时,**每节 lesson 末尾的"5 个验证"应该明确标"必跑"和"nice-to-have"**。必跑是课程主题依赖的,nice-to-have 是独立性强的;nice-to-have 卡住时可以果断跳过 + 记 follow-up,不会让学生陷在跟主题无关的 debug 里。
