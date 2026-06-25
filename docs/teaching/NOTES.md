# NOTES.md

## 用户环境

- 平台: macOS,使用 **OrbStack** 作为 Docker 引擎
- Docker 引擎: OrbStack 自带(不需要 Docker Desktop)
- Docker CLI 共存:
  - `/opt/homebrew/bin/docker` 29.5.3 — Homebrew 装,PATH 最前,实际在用
  - `/usr/local/bin/docker` 29.4.0 — OrbStack 自带的软链(指向 `/Applications/OrbStack.app/Contents/MacOS/xbin/docker`),不删,因为是 OrbStack 设计的自洽产物
- Docker Compose v2 plugin: 通过 `~/.docker/cli-plugins/docker-compose` 软链指向 Homebrew 装出来的二进制,Docker CLI 才能扫到
- `.zshrc` 里加了 `export PATH="/opt/homebrew/bin:$PATH"`,控制 PATH 顺序
- 现状: 单一权威 = Homebrew;OrbStack 软链作为"伴生",不冲突

## 教学小教训

- `find -type f` 只看普通文件,会漏掉 symlink。要查"所有可执行/可调用入口"用 `ls -la` 或 `find -type l` + 单独列文件
- 看到 `/usr/local/bin/...` 上的"老版本"不要立刻推断是 Docker Desktop 残留,**先 `ls -la` 看 symlink 目标**,再判断来历

## 用户偏好

- 沟通语言: 中文为主,代码/术语用英文
- 学习风格: 边学边改项目(learn-by-doing),**每节 lesson 至少要有一次 git commit 作为交付物**
  - commit 必须真实落到文件(不是"我会改"的口头承诺)
  - commit message 用 conventional commits 风格(`feat:` / `fix:` / `chore:` / `docs:` / `refactor:`)
  - 每节课末尾明确给出"commit 一句话描述 + 改动文件清单 + 验证命令"
  - 不需要用户自己起 commit message,我会在 lesson 末尾给出
- Node.js 基础: 完全空白,所有"为什么 Node 这样"的底层问题都不能跳过
- 第一阶段锚点: 可观测性三件套(Pino / request id / AllExceptionsFilter)+ 健康检查 + Swagger

## 已完成的 commit 候选(用户行为清单)

- 0001: `apps/gateway/src/main.ts` 加了一行 `console.log('cwd:', process.cwd(), 'env.PORT:', process.env.PORT);`(**未 commit,等攒一起 commit**)
- 安装 `@types/express`(`pnpm add -wD @types/express` — **未 commit**)
- 改 `.zshrc` 加 PATH(**不应该 commit,这是用户级配置,不是项目代码**)
- 软链 `~/.docker/cli-plugins/docker-compose`(**不应该 commit**)

## 📋 30-50 课时总体大纲(2026-06-23 校准)

**用户原始规划**:30-50 课时,基于 nest-search,Node/NestJS/DB/Docker 从 0 学起,改造成企业级最佳实践。

**校准后总目标:50 课时**(Phase A 必修 30 + Phase B 全栈深度 38 + Phase C 加分 43 + Phase D 全栈必须补充 50)

### 已完成:18 课时(2026-06-22 截止)

- 主线 0001-0008:Node 运行时基础(8 节)
- principles 0009-0012:NestJS 原理(4 节)
- 副线 1 0013-0015:测试体系(3 节)
- 副线 2 0016-0018:跨服务迁移(3 节)

### Phase A · 必修 12 节(MISSION + LR-0002 缺口)— 18 → 30

| 课 | 主题 | 对应缺口 | 预计 |
|---|---|---|---|
| 0019-0021 | Zod 配置校验 + DTO 推断 | LR-0002 #6 | 3 节 |
| 0022-0024 | Drizzle 深度(schema + 迁移 + 事务) | 你原始 DB | 3 节 |
| 0025-0026 | 优雅退出 + AllExceptionsFilter 深入 | LR-0002 #9 + #2 | 2 节 |
| 0027-0028 | JWT 深入(refresh rotation + 黑名单) | LR-0002 #7 | 2 节 |
| 0029-0030 | 健康检查深度(liveness/readiness + 自定义) | LR-0002 #3 | 2 节 |

### Phase B · 全栈深度 8 节 — 30 → 38

| 课 | 主题 | 备注 |
|---|---|---|
| 0031-0033 | Redis 深度(数据结构 + 分布式锁 + Cache-Aside) | user 强调 |
| 0034-0036 | BullMQ 深度(Queue/Worker + 重试 + 延迟任务) | user 强调(替代 RabbitMQ) |
| 0037-0038 | 错误处理模式(retry + circuit breaker + bulkhead) | MISSION 缺 |

### Phase C · 加分项 5 节 — 38 → 43

| 课 | 主题 |
|---|---|
| 0039-0040 | 测试进阶(contract / load) |
| 0041-0042 | 监控告警(SLO/SLI/Prometheus) |
| 0043 | OpenTelemetry trace 链路追踪 |

### Phase D · 全栈必须补充 7 节 — 43 → 50

| 课 | 主题 | 备注 |
|---|---|---|
| 0044-0045 | 认证/授权深入(OAuth 2.0 / OIDC / CAS 完整 flow) | nest-search 现有 CAS 浅做,补深度 |
| 0046-0047 | WebSocket / SSE(实时通知 / 协同 / 监控大屏) | nest-search 现 0 实时能力 |
| 0048 | 文件上传 / S3 预签名 URL(头像 / 合同 / 报告) | 企业 90% 场景有文件 |
| 0049 | 依赖注入 scope 进阶(request / transient 边界) | NestJS 独有,常踩坑 |
| 0050 | API 版本控制 + 灰度发布(URI/Header 策略 + 渐进迁移) | 多版本共存 + 蓝绿 |

### 选题决策准则

1. **MISSION 优先**:任何 MISSION 写的"3-5 企业级补丁"必修
2. **LR-0002 缺口**:10 个缺位中未完成的 4 个必修
3. **用户强调主题**:redis/bullmq/zod/drizzle 必修
4. **依赖深度**:Drizzle + Zod + Joi + Redis + BullMQ 都"用过但未深入",要专门课
5. **全栈补充(Phase D)**:OAuth/WebSocket/文件上传/scope/版本控制 — 企业级必备

### Lesson 交付约定(2026-06-24 用户偏好)

- **每次写新 lesson 必须给用户文件路径**,方便用户直接 cat / 编辑器打开
- 路径格式:`docs/teaching/lessons/XXXX-name.md`
- 提供配套参考文档链接(drizzle-orm-reference / validation-libraries)
- 给出章节结构概览(让用户知道先看哪节)
- 提供打开命令(`cat` / `code`)

### 工作流约束(2026-06-22 起)

- **lesson HTML 由 Claude 写**(纯指南)
- **业务代码由 user 写**(learn-by-doing 真义)
- **Claude 负责**:解释概念 + 设计决策 + 卡住时给提示 + 写 LR + commit message
- **user 负责**:写代码 + 跑测试 + commit
- **不再有"我替你写完"的伪动手**


### Phase E · 企业级 DB 架构(2026-06-24 用户偏好)

- **课程编号**:0051-0056(6 节,接 Phase D 0050 之后)
- **参考文档(必读前置)**:`reference/enterprise-database-architecture.md`
- **每次课结构**:现状盘点 → 改造 → 验证(3 段式)
- **降级约定**:如果 nest-search 改不动(比如 form/sync 拆 DB 影响太大),**降级为 design exercise**(不动代码,只产出迁移方案文档)
- **不引入新中间件**:ShardingSphere / Vitess 都是 Java 生态,nest-search 是 Node,**应用层手写**
- **撞到的 TS 错 / 选型决策** → LR-0051/0052/...

