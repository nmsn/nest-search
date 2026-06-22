# 0017 — 副线 1(测试体系)首节撞到的反模式 + 0014 启示

> 0013 是副线 1(测试体系)的第 1 课。这一篇记录 0013 实际撞到的反模式 / 盲点 / 决策,给 0014 做铺垫。

## 0013 实际产出

| 项 | 内容 |
|---|---|
| Commit | `e5bb211 test(gateway): add Jest unit tests for 3 principles-track services (0013)` |
| 文件 | 8 个: `jest.config.js`、`tsconfig.spec.json`、`package.json`、`.gitignore`、3 个 `.spec.ts`、`0013-jest-unit-testing.html` |
| 测试 | 11 passed / 11 total(RolesGuard 4 + ProxyService 4 + HttpClientService 3) |
| 覆盖率 | 3 个目标 service 100% Stmts / Branches / Funcs / Lines |
| Lesson | 530 行 HTML,5 章节 + 3 道 quiz + 完整 commit message |

**核心交付**:nest-search 第一次有了"自动化安全网" — 改任何 0010-0012 写的代码,1 秒内知道有没有破坏其它地方。

## 撞到的反模式(5 条)

### 反模式 1 · 假设 ts-jest 自动加载 `@types/jest`

**症状**:第一次跑 `pnpm test`,3 个 spec 套件全部 `Test suite failed to run`,每个报:

```
TS2593: Cannot find name 'describe'. Do you need to install type definitions
for a test runner? Try `npm i --save-dev @types/jest` ...
```

**反模式**:我在 lesson §2 写"Jest 装好就能用",**实际上 NestJS monorepo 默认的 `tsconfig.json` 不显式列 `types`,ts-jest 不会自动加载 `@types/jest`**。

**根因**:
- 前端项目(Vite/Webpack)通常用 `vite/client` 之类的"魔法"types 自动注入
- NestJS CLI 生成的是"裸"tsconfig,所有 `@types/*` 自动加载是 TypeScript 默认行为没错,但 ts-jest 29 + monorepo 的某些组合下,`typeRoots` 解析出问题
- TypeScript 报错信息(建议装 @types/jest)其实是误导 — 已经装了,问题是没声明

**正确做法**:lesson §4.0 这次补了 **`tsconfig.spec.json`**(独立于 root tsconfig),里面显式 `"types": ["jest", "node"]`。jest.config.js 通过 `transform` 告诉 ts-jest 用它。

**Why this matters**:这是 NestJS monorepo 项目的**通用痛点**,每个新项目都要撞一次。Lesson 必须从一开始就把这个步骤写进"基础设施清单"。

### 反模式 2 · 用 `apps/gateway/tsconfig.app.json` 编译 spec

**症状**:`apps/gateway/tsconfig.app.json` 里有这一行:

```json
"exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
```

**反模式**:NestJS CLI 生成的 `tsconfig.app.json` 默认就排除 `**/*spec.ts`。如果让 ts-jest 用它(spec 文件自然落在 `src/**/*` 但被 exclude),**类型检查就被悄悄跳过了** — 表面上能跑,实际上类型错误不会报。

**正确做法**:用独立的 `tsconfig.spec.json`,`include: ["apps/**/*.ts"]`,**不 exclude spec 文件**,ts-jest 才能真正校验 spec 里的类型。

### 反模式 3 · `as any` 跳过 mock 的类型

**症状**:3 个 spec 全部长这样:

```ts
mockHttp = { request: jest.fn() } as any;
```

**反模式**:`as any` = "我放弃 TS 类型检查"。本来引入 `jest.Mocked<HttpService>` 才是正解:

```ts
const mockHttp: jest.Mocked<HttpService> = {
  request: jest.fn(),
} as any;
```

**为什么这么写**:写 spec 时追求"快跑起来",但**单元测试**的核心价值之一就是"用 TS 类型告诉你 mock 漏了什么"。`as any` 把这个价值消掉了。

**Lesson 设计选择**:这次先 `as any` 跑通,lesson 里**没强调这个反模式** — 应该在 §3 mocking 部分就点出:`jest.Mocked<T>` 是类型增强的入口,`as any` 是 trade-off 的捷径。

**改进**:
- 0014 e2e 应该用 `@nestjs/testing` 的 `Test.createTestingModule()` 配真实 mock,而不是 `as any`
- 长期应该用 jest-mock-extended 或 ts-mockito 替代手写 mock

### 反模式 4 · 课文中数字不一致

**症状**:lesson §"你今天会拿到什么" 第 5 条写 "12/12 测试通过",§4.4 也写 "12 passed, 12 total",但实际跑出来是 **11 passed**(4 + 4 + 3)。

**反模式**:lesson 设计时不验证实际数字,直接按"心理预期"写。

**正确做法**:lesson 写完必须跑一次,把真实输出贴回去 — 这次是写完 + 跑通后才发现并修正的(改了 4 处),应该一开始就跑。

### 反模式 5 · jest.config.js 引用 tsconfig 但 lesson 没解释

**症状**:lesson §4.0 原版 jest.config.js 没有 `tsconfig` 字段,`transform: { '^.+\\.(t|j)s$': 'ts-jest' }` 配出来直接跑不通。

**反模式**:lesson 把"为什么需要 `tsconfig.spec.json`" 留到后续修 bug 才补,违反"渐进披露 + 自顶向下"。

**正确做法**:lesson §4.0 这次补完,变成:

```js
transform: {
  '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
},
```

+ 一段"为什么需要这个文件"的解释(NestJS monorepo 痛点)。

## 正向收获(3 条)

### 收获 1 · 100% coverage 一次到位

3 个目标 service 都是**纯逻辑**(无 HTTP/无 DB),单元测试成本极低。`RolesGuard` / `ProxyService` / `HttpClientService` 三个文件每个 ~30 行,测试每个 ~50 行,**测试:源码 ≈ 1.5:1** — 这就是"高价值低成本的测试"。

### 收获 2 · AAA pattern 真的管用

3 个 spec 全用 Arrange / Act / Assert 切分,读完 spec 一眼能看懂"在测什么"。比"流水账式 expect"好维护 10 倍。

### 收获 3 · test:cov 输出要先 gitignore

`.gitignore` 加 `coverage/` 这一行之前,我 commit 时差点把 `coverage/` 整个目录拉进去(里面是 `lcov.info` / `lcov-report/`)。Lesson §4.0 没提,算漏掉的"新手坑"。

## 副线 1(测试)全景 + 节奏

| 课 | 主题 | 状态 | 产出 |
|---|---|---|---|
| **0013** | Jest 单元测试基础 | ✅ done | 3 个 spec + 基础设施 |
| **0014** | Supertest e2e 测试 | ⏳ next | 1 个完整链路 e2e + NestJS Testing module |
| **0015**(预想) | CI 集成(GitHub Actions) | 待定 | `.github/workflows/test.yml`,push 即测 |

**为什么这个顺序**:unit test 是"逻辑层"安全网(便宜),e2e 是"集成层"安全网(贵但更接近用户)。先 unit 后 e2e 是"先 low-hanging fruit 后 critical-path"的经典顺序。

## 0014 关键决策(预告)

### 决策 1 · e2e 用真 DB 还是 mock DB?

| 方案 | 优 | 劣 |
|---|---|---|
| **真实 MySQL**(`docker-compose up`) | 接近 prod,真实 SQL | CI 里要装 docker,慢 |
| **SQLite in-memory**(`better-sqlite3`) | 极快,无依赖 | Drizzle/MySQL 方言差异 |
| **testcontainers**(Docker 启动 MySQL) | CI 友好 + 真实 SQL | 配置复杂 |

**0014 默认选**:`docker-compose up -d mysql` 起真 MySQL + Drizzle migration,e2e 跑前清表。简单直接,符合"先跑通再优化"。

### 决策 2 · e2e 测哪条链路?

原则:**1 个 e2e = 1 个用户故事**。

候选:
- A. `POST /api/auth/register → POST /api/auth/login → GET /api/auth/me` ← 经典三段式
- B. `POST /api/sync/full → 验证 ES 索引有数据 → 验证 MySQL 有记录` ← 跨服务

**0014 默认选 A** — 单服务(auth-service),链路完整,无 ES 依赖,失败可定位。

### 决策 3 · NestJS Testing module 怎么用?

```ts
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],  // ← 整个 app 起来
}).overrideProvider(AuthService).useValue(mockAuth).compile();

const app = moduleRef.createNestApplication();
await app.init();
```

**关键点**:`.overrideProvider()` 只在 e2e 里替换,**不改生产代码**。这跟单元测试的 mock 是同一个思想,只是粒度更粗。

## 给自己的反思

0013 撞的 5 个反模式,根因都是同一个:**对 NestJS monorepo + ts-jest 这套工具链的不熟悉**。

LR-0014(IoC 盲点)教训是"不懂就查文档",LR-0015(AOP 盲点)教训是"边界要清楚",LR-0017(本篇)的教训是:

> **NestJS 测试基础设施和"业务代码测试"是两件事 — 前者是 devops 工程问题(配置 / 工具链),后者是设计问题(测什么 / 怎么 mock)。Lesson 必须把两者分开,不要混着讲。**

下次 lesson(0014)开篇会单独加一节"测试基础设施清单",把 devops 那部分一次性讲清,然后才进入"业务测试"。

---

**说干就开 0014 — 默认方案:docker-compose 起真 MySQL + Drizzle migration + auth-service register/login/me 链路。**
