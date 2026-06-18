# 0011 — 主线收官 + 4 个 lesson 反思盲点

## 8 节课主线完成 ✅

| 课 | 一句话 |
|---|---|
| 0001 | Node 怎么动 |
| 0002 | 错误怎么"显" |
| 0003 | 进程怎么"死" |
| 0004 | 请求怎么"流" |
| 0005 | 日志怎么"查" |
| 0006 | 运维 / 前端能"看见" |
| 0007 | 服务不被刷爆 |
| 0008 | 跨服务能"串" + 接口字段真实 |

**8 节课 = 一个企业级 NestJS service 全部对外的"接线"**。从 8 年前端工程师,走完这条主线,具备了"独立设计/实现/上线"一个 NestJS 后端服务的能力。

## 0008 验证状态

- ✅ 跨服务追踪金样本(在 Claude 环境跑通):gateway 自动生成 reqId → 转 x-request-id 头 → auth-service 收到 → 三处一致
- ⚠️ 4.6.1 / 4.6.2 DTO 校验验证(用户没跑,代码本身已对,缺 terminal 端验证)
- ✅ 3/3 quiz(连续 6 节)

## 4 个本节课盲点(进 lesson 设计 checklist)

### 盲点 1:lesson 写"完整代码示例"时删了已有依赖

**两次发生**:
1. 4.5 改 constructor 时把 `PinoLogger` 注入删了,只留 `REQUEST`
2. 4.5 改 `this.logger.log` 但 PinoLogger 没 `log` 方法,应该是 `info`

**根因**: lesson 里贴"完整代码示例"时,**用整块替换而不是 diff**,导致隐式删了用户已装的依赖。

**修法**: lesson 设计时:
- 优先 diff 形式(显示 + / -)
- 或者标"前置: 文件已有 X,Y,Z,本节加 A,B,C"
- 写完整代码前先 `git diff` 一下文件当前状态

### 盲点 2:0005 lesson 漏装 peer dep,影响 0008

0005 改 gateway 时只装了 `nestjs-pino`,但没在其他服务(auth/search/form)装。0008 跨服务追踪需要每个服务都装,**auth-service 没装就 grep 不到 requestId**。

**修法**: 涉及"全栈可观测性"的 lesson,必须明说"每个服务都要装"。或者 0005 时一次性把 4 个后端服务都装上。

### 盲点 3:lesson 边界效应

proxy.service.ts 的"throw error.response.data"修复(0005)时,没有意识到下游服务也可能有同样问题 — 但因为 0005 范围是 gateway,**没扩散到 auth-service**。这是"lesson 范围 vs 现实影响"的边界,后开课要权衡:lesson 范围是按"单服务"还是按"全栈"。

### 盲点 4:autoLogging 决策与 TimingInterceptor 耦合

0005 关掉 pino-http 的 autoLogging 是因为 TimingInterceptor 替代了。0008 装 auth-service 时,我**默认沿用 autoLogging: false**,导致 auth-service 业务不打 logger 时,完全没日志可 grep。

**修法**: 装 LoggerModule 时,**先看这个服务有没有 TimingInterceptor / 等价的访问日志**。没有就 `autoLogging: true`,有就 `autoLogging: false` + 自己打日志。

## 跨节共性(8 节课后的总结)

**最大的共性**: **"显式 opt-in + 装配细节"**

所有 NestJS 高级能力(健康检查、Pino、限流、DTO 校验、跨服务追踪、Swagger)都遵循:
1. 框架默认关闭(性能 / 兼容性)
2. 你要 `forRoot({...})` 显式开
3. 装配的细节(peer dep、生成 ID 范围、log level、storage backend)都决定最终行为
4. **装配错 = 行为错,不报错**(silent failure)

**backend 跟前端的根本不同**: 前端框架"开箱有大量默认行为";backend 框架"默认关,要自己装 + 自己装配细节"。

**未来 lesson 设计原则**:
1. 任何 `forRoot({...})` 都列出"必填项 vs 可选项 vs 易错项"
2. 任何"全局 X" 都列出"X 影响哪些端点 / 不影响哪些"
3. 任何"框架 default off" 都列"装上后的最小验证"

## 关键 stat(8 节课)

| 维度 | 数量 |
|---|---|
| 主线 lesson | 8 |
| 连续 quiz 满分 | 6(从 0003 起) |
| 真实工程坑已发现 | 14+ |
| 真实工程坑已修 | 12+ |
| 已记进 follow-up | 5(keepAliveTimeout, 全 NestJS Logger 迁移, DTO 严格化全栈, peer deps 扫描, autoLogging 默认值) |
| 课程总 commit | 11+ |

## 副线候选(0008 完成后可走)

| 副线 | 预计节数 | 价值 |
|---|---|---|
| 1. 把可观测性 / 限流 / DTO 模式迁到 auth / search / form 3 个服务 | 2-3 节 | 把单服务能力扩展到全栈 |
| 2. Jest 单元测试 + Supertest e2e 测试 | 2-3 节 | 改任何东西都有安全网 |
| 3. GitHub Actions CI/CD | 1 节 | 提交即测,自动化 |
| 4. Docker 多服务打包 / K8s 部署 | 1-2 节 | 真正上线的最后一公里 |

具体走哪条副线,用户说。

## 主线收官的认知提升

8 节课最大的收获不是"学会了 8 个 API",而是:

1. **判断力**: "要不要做 / 怎么做"比"做"更重要(0005 keep-alive 选 C 路线、0008 DTO 严格化、抄的 Decorator 黑盒拆开)
2. **诊断力**: shell 调试 / for 循环 / 0005 keep-alive 都展示了"通过现象找根因"的方法
3. **架构直觉**: 跨服务追踪 = 跨进程日志共享 ID;DTO = 接口契约;健康检查 = 主动声明依赖

这些是 8 年前端经历 + 8 节课后端训练,合成出的"T 形工程师"能力。
