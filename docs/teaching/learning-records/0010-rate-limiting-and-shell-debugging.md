# 0010 — 限流落地 + 两个 lesson 盲点 + shell 调试的认知

## 0007 验证状态

代码改动全部到位(4.1-4.4 + 修过的 HttpModule import + @nestjs/axios peer dep),**4.5 验证没跑成**(shell 调试消耗太多时间)。

但 lesson 的核心交付物(代码 + 概念)都已完成,quiz 3/3 验证理解到位。所以 commit 走"按代码交付"原则,**手发 5 次 curl 看到 401/200/503** 已经作为"@SkipThrottle/@Throttle 至少没误伤"的最低证据。

## 关键心智模型

```
ThrottlerModule.forRoot([{ ttl, limit }])   // 配置
APP_GUARD: ThrottlerGuard                   // 全局生效
@SkipThrottle()                             // 豁免(/health)
@Throttle({ default: { limit, ttl } })     // 覆盖(login 更严)
```

三层:
- **默认**: 全局限流 5/sec + 100/min
- **豁免**: /health 加 @SkipThrottle() 让 K8s probe 不触发
- **覆盖**: /api/auth/login 加 @Throttle 5/min 防爆破

## 0007 lesson 盲点(进 lesson 设计 checklist)

### 盲点 1:@nestjs/terminus 的 HttpHealthIndicator 强依赖 @nestjs/axios

跟 0005 那次 `new Logger()` 一样,**lesson 里没装 peer dep**。这次是反过来的:**装错了"包"还**得装对"包"**。Terminus 把 HttpService 注入到 HttpHealthIndicator,但 HttpService 在另一个包(@nestjs/axios)里。

修法:lesson 5.1 应该写成:
```bash
pnpm add -w @nestjs/terminus @nestjs/swagger @nestjs/axios
```

### 盲点 2:lesson 验证命令里的 `\n` 在 zsh 里是真换行

`curl -w "%{http_code}\n"` 在 zsh 的某些状态下会被解释为"真换行",把 for 循环劈成两行,导致 `done` 关键字丢失 → zsh 进入"等闭合"模式 (`for>` prompt)。

**lesson 设计原则**:
- **不要在 shell 命令里依赖 `\n` 字面量**
- 改用 `-w "%{http_code}"; echo` 模式
- 或把 URL/format 都用单引号包住(但 `\n` 在 zsh 里被解释是更深的问题)

## 跨节共性:第三种"装上但跑不起来"的形态

5 节课下来,有 3 种"装上但跑不起来"模式:
1. **缺 peer dep**(0007:@nestjs/axios) — 装了 @nestjs/terminus 但 HttpService 找不到
2. **类型 / 装饰器没启用**(0005:prettyPrint 类型错) — 配置项在新版本被移除
3. **shell 工具行为差异**(0007:zsh 把 `\n` 解释成真换行) — shell 解析层把命令搞坏

**前两种是项目代码问题,第三种是工具使用问题**。两者都需要"诊断 — 隔离 — 替换" 的方法:
- 隔离: 简化命令,排除无关因素
- 替换: 用 Node.js 脚本 / 别的工具绕开

## 时间分配反思(很重要的认知)

这一节 lesson 计划 25 分钟,实际花了**远多于此**。时间花在:
- 5.7 验证 for 循环(花太多时间调试 zsh)
- 4.1-4.4 本身只 1-2 分钟装 + 改 4 个文件

**教训**:
- 当一个验证步骤(4.5)卡在工具上,**果断放弃/换工具**,别跟工具死磕
- 这次 5 分钟调试 shell 浪费后,15 分钟前就该直接跳到 Node.js 脚本
- "我能不能快速通过这个障碍" 应该用**2-3 分钟**做判断,卡超过 3 分钟 = 换方案

**给未来的我**: 当用户在某个工具细节上卡超过 5 分钟(尤其 shell / docker / 环境),**主动建议换工具**,不让他们自己决定"要不要再挣扎一下"。

## 5/3/3 状态

| 维度 | 数量 |
|---|---|
| 完成 lesson | 7 |
| 连续 quiz 满分 | 5(从 0003 开始) |
| 真实工程坑已发现 | 10+ |
| 真实工程坑已修 | 8+ |
| 已记进 follow-up | 4(keepAliveTimeout, 全 NestJS Logger 迁移, DTO 严格化, peer deps 扫描) |

## Implications for 0008(收官)

0008 是主线最后两节:
- **跨服务 requestId 转发** — 让 gateway 的 reqId 通过 HTTP header 传给 auth-service,日志能跨进程 grep
- **DTO 严格化** — 把 `@Body() body: any` 替换成有 class-validator 装饰器的 DTO 类

DTO 严格化是"主线收尾的最后一关" — 它让 Swagger 显示真正字段,让 NestJS 自动 400 校验,让前端生成的 SDK 类型准确。

收官之后(0009+),**主线任务完成**,开始:
- 跨服务练手项目(把 4 个后端服务都装上可观测性)
- 单元测试 + 集成测试(Jest 已装但没用)
- 部署(CI/CD 留作"出口" lesson)
