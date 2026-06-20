# 0016 — Principles 轨道收官(0009-0012 共 4 节)+ 副线选择

> 0012 是 principles 轨道最后一课。这一篇总结 4 节整体产出 + 反思 + 副线选择。

## Principles 4 节产出

| 课 | 主题 | 产出 | 验证 |
|---|---|---|---|
| 0009 | 装饰器与元数据 | 30 行 demo + @Roles 装饰器 + check-roles script | script 输出 [ 'admin', 'editor' ] ✅ |
| 0010 | IoC 容器 | HttpClientService + HttpClientModule | 跨服务追踪代码精简到 1/3 ✅ |
| 0011 | AOP 切面 | RolesGuard(读 @Roles)+ 测试 script | 4/4 测试用例通过 ✅ |
| 0012 | Module 系统 | ProxyModule(@Global)+ AuthProxyModule | AppController 短 60 行,AppModule 变 composition root ✅ |

**核心心智模型**:从"用框架"到"理解框架"的完整旅程 —

```
0009 微观:method / property / metadata / decorator
      ↓
0010 微观:Provider / IoC / scope / ModuleRef
      ↓
0011 微观:Guard / Pipe / Interceptor / Filter
      ↓
0012 宏观:Module / @Global / DynamicModule / forwardRef
```

## LR 系列沉淀(principles 轨道 6 个)

| LR | 主题 | 用途 |
|---|---|---|
| LR-0011 | 主线收官 | 8 节主线总结 |
| LR-0012 | MR/DI primer(10 问答) | DI / @Injectable / Module 心智模型 |
| LR-0013 | 0009 盲点 | decorator 5.3 被 guard 挡 + syncFull 未定义 |
| LR-0014 | 0010 盲点 | Provider 4 种写法决策树 + scope 传染性 |
| LR-0015 | 0011 盲点 | 401/403 边界 + NestJS/Express 层次 + 命名冲突 |
| LR-0016(本篇) | principles 收官 | 4 节总结 + 副线选择 |

## 4 节 quiz 总成绩

| 课 | 分数 |
|---|---|
| 0009 | 3/3 |
| 0010 | 3/3 |
| 0011 | **1/3** ← 8 节满分连击断在这里 |
| 0012 | 待答 |

**0011 的 1/3 比 8 节满分更有价值**:暴露 401/403 边界 + NestJS/Express 层次两个"盲角",写进 LR-0015 → 下次 lesson 设计会避开。

## principles 4 节总 commit

```
6cd6b65 feat(gateway): add RolesGuard + wire @Roles into AOP pipeline (0011)
bf11284 feat(gateway): extract HttpClientService via useFactory pattern (0010)
54e33be chore(gateway): add @Roles() decorator + decorators demo (0009)
```

3 个 commit,共 12 个文件改动,principles 轨道新增 ~2500 行代码(LR + lesson HTML)。

## nest-search 当前架构(0012 后)

```
AppModule (composition root, 60 行)
├── imports:
│   ├── ConfigModule.forRoot({ isGlobal: true })
│   ├── HttpClientModule
│   ├── LoggerModule.forRoot({ ... })
│   ├── ThrottlerModule.forRoot([...])
│   ├── HealthModule
│   ├── ProxyModule (@Global)              ← 0012 新加
│   └── AuthProxyModule                    ← 0012 新拆
├── controllers: [AppController]          ← 短了 60 行(5 个 auth 路由搬走)
└── providers:
    ├── LifecycleProbeService
    ├── 4 个 APP_GUARD(CasGuard / ApiKeyGuard / ThrottlerGuard / RolesGuard)
    ├── 1 个 APP_INTERCEPTOR(TimingInterceptor)
    └── 1 个 APP_FILTER(AllExceptionsFilter)
```

**AppModule 现在是"composition root"** — 只负责"装哪些 module",不参与具体业务。

## 副线选择 — 4 条候选

### 副线 1:跨服务迁移(把可观测性 / 限流 / DTO 模式迁到 auth / search / form)

**预计节数**:2-3 节
**价值**:把"单服务能力"扩展到"全栈"
**状态**:
- ✅ gateway 已完整
- ❌ auth-service 用 NestJS 默认 Logger(0005 没改)
- ❌ search / form / sync-service 完全没装可观测性

### 副线 2:Jest 单元测试 + Supertest e2e

**预计节数**:2-3 节
**价值**:改任何东西都有安全网
**状态**:
- ✅ jest + ts-jest 已装
- ❌ 0 行测试
- ❌ 没 e2e 框架

### 副线 3:GitHub Actions CI/CD

**预计节数**:1 节
**价值**:提交即测,自动化
**状态**:
- ❌ 没 CI 配置
- 跟 副线 2 配合效果最好

### 副线 4:Docker / K8s 部署

**预计节数**:1-2 节
**价值**:真上线最后一公里
**状态**:
- ✅ docker-compose.yml 已写(本地开发)
- ❌ 没 Dockerfile(没 prod 镜像)
- ❌ 没 K8s manifests

## 推荐优先级

**我的建议**:先走 **副线 2(测试)**,理由:

1. **principles 轨道刚写完 12 节 ~2500 行新代码** — 这是"风险最高"的阶段,**没有测试保护**,改一处就可能 break 另一处
2. **副线 2 是其他 3 条的前置** — 没有测试,你做 CI/CD 时 CI 跑啥?做部署时验证啥?
3. **测试也是 NestJS 高级开发者的核心能力** — 跟"principles 轨道"匹配度高

如果你同意走副线 2,**0013 = Jest 单元测试基础**(测试 decorator / guard / interceptor / 4 个 lifecycle / @Injectable 这类纯逻辑),**0014 = Supertest e2e**(真实 HTTP / 数据库容器化 / 关键路径测试)。

## 给原则的反思

4 节下来,我自己的 lesson 设计能力进化轨迹:

```
0009(初版): 装饰器理论 + demo,问题:示例代码有 bug,5.3 被 guard 挡
0010: 加 @Roles refactor 实战,问题:命名冲突,4 种写法决策树不全
0011: RolesGuard 实战,问题:401/403 没单独成块
0012: Module 系统实战,问题:app.module.ts 编辑时文件被改(Edit 重读)
```

**每节 lesson 都撞盲点,但 LR 系列都接住了**。**未来每节 lesson 写完 + LR,这是个闭环**。

## 副线 2(测试)预览(如果你选的话)

0013:
- §1 Jest 基础:describe/it/expect + mock
- §2 单元测试用例结构:Arrange / Act / Assert
- §3 实战:写 RolesGuard 单测(纯逻辑,无 HTTP)+ ProxyService 单测 + AllExceptionsFilter 单测
- §4 跑覆盖率报告
- §5 Quiz + commit

0014:
- §1 Supertest + NestJS Testing module
- §2 e2e 测试结构
- §3 实战:跑一次完整 register → login → /me 链路
- §4 数据库容器化(testcontainers)
- §5 Quiz + commit

---

**说副线方向,我开干。** 默认我开 0013(Jest 单元测试基础)。