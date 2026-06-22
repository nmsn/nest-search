# 0018 — 副线 1(测试体系)收官 + 0014 撞到的反模式

> 0014 是副线 1(测试体系)第 2 课。这一篇记录 0014 撞到的 5 个反模式,以及副线 1 整体(0013 + 0014)收官总结。

## 0014 实际产出

| 项 | 内容 |
|---|---|
| Commit | `b56805a test(auth-service): add Supertest e2e for register/login/me chain (0014)` |
| 文件 | 6 个: `jest.config.js`、`package.json`、`pnpm-lock.yaml`、`redis-memory.service.ts`、`auth.e2e-spec.ts`、`0014-supertest-e2e.html` |
| 测试 | 7 个新增 e2e it(): register(201/409/400) + login(201/401) + /me(200 happy + 200 null) |
| 基础设施 | supertest 7 + @types/supertest 6 |
| Lesson | 540 行 HTML,5 章节 + 3 道 quiz + 完整 commit message |
| 总测试数 | 11(单测)+ 7(e2e)= **18 passed / 18 total** |

**核心交付**:auth-service 第一次有了"用户故事 e2e" — register → login → /me 链路 + 真 MySQL + in-memory Redis mock 跑通。

## 撞到的反模式(5 条)

### 反模式 1 · `testMatch: ['**/*.spec.ts']` 不会匹配 `*.e2e-spec.ts`

**症状**:跑 `pnpm test`,jest 报告 "184 files checked, 3 matches",e2e 文件死活不进来。

**根因**(实测后才发现):micromatch(以及 find 的 `-name`)的 `*.spec.ts` glob 里,`**`\*` 不匹配文件名中段的 `.`**。也就是说:
- `auth.spec.ts` → 匹配 ✓
- `auth.foo.spec.ts` → 匹配 ✓(因为 `.foo` 是 `.spec.ts` 前面的整体)
- `auth.e2e-spec.ts` → **不匹配** ✗(因为 `*.spec.ts` 只匹配 `.spec.ts` 字面前缀等于 `*`)

**正确做法**:testMatch 显式加 `*.e2e-spec.ts`:

```js
testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
```

**Lesson 设计教训**:lesson §4.0 必须把"testMatch 改两行"作为基础设施步骤写明,不能默认"jest 会自动发现"。

### 反模式 2 · Supertest 7.x 的 import 语义变了

**症状**:

```ts
import * as request from 'supertest';
// TS2349: This expression is not callable.
// Type '{ default: SuperTestStatic; ... }' has no call signatures.
```

**根因**:Supertest 7.x 改成了 ESM-style default export。老教程、stackoverflow 答案几乎全部是 `import * as request from 'supertest'` — 那在 v7 跑不通。

**正确做法**:

```ts
import request from 'supertest';
```

**Lesson 设计教训**:Lesson 写 supertest 代码时必须标版本"v7+",否则用户复制粘贴会直接挂。

### 反模式 3 · `moduleRef.get(RedisMemoryService)` 拿到 undefined

**症状**:`overrideProvider(RedisService).useClass(RedisMemoryService)` 之后,想拿 mock 实例做断言:

```ts
redis = moduleRef.get(RedisMemoryService);  // ← undefined!
```

**根因**:`overrideProvider(X).useClass(Y)` 的语义是"用 Y 类替换 X 这个 token",但 **NestJS 仍然按 X token 注册这个实例**。所以 `moduleRef.get(Y)` 找不到,`moduleRef.get(X)` 才是替换后的实例。

**正确做法**:

```ts
redis = moduleRef.get(RedisService) as RedisMemoryService;
```

**Lesson 设计教训**:lesson §3 讲"overrideProvider"时必须强调"按原 token get,不要按新 class get"。这是个<strong>非常容易踩</strong>的坑,因为直觉上"新类名 get 新类"听起来对。

### 反模式 4 · Supertest 类型把 `set-cookie` 当 string

**症状**:

```ts
const cookies = res.headers['set-cookie'];
expect(cookies.some(...));  // ← TS2339: Property 'some' does not exist on type 'string'
```

**根因**:Supertest 7.x 的类型定义继承了 Express `IncomingHttpHeaders`,里面 `set-cookie?: string`。但 Express 运行时实际返 `string[]`。**类型和运行时不一致**。

**正确做法**:

```ts
const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
```

**Lesson 设计教训**:Lesson 演示 cookie 断言时必须给完整代码,不能省略"set-cookie 是 array"这个细节。

### 反模式 5 · Lesson 写完到 commit 前忘了验真

**症状**:lesson §4.2 的 e2e 代码最初版是:

```ts
import * as request from 'supertest';  // ← 反模式 2
redis = moduleRef.get(RedisMemoryService);  // ← 反模式 3
expect(cookies.some(...));  // ← 反模式 4
```

**根因**:Lesson 是"设计文档"心态写的,没真的跑通就贴进 HTML。

**正确做法**:Lesson §4.3 之前必须把代码复制到真实项目,跑通,把真输出贴回去。这次是 commit 前 `pnpm test` 才发现 5 处错误,临时改了 lesson 再 commit — 应该一开始就跑。

**Lesson 设计教训**:Lesson 写代码章节时,要养成的习惯 — **先把代码 commit 进项目 + 跑通 + 看输出 → 再写进 lesson HTML**。不是反过来。

## 副线 1(测试)全景 + 节奏

| 课 | 主题 | 状态 | 产出 | 测试数 |
|---|---|---|---|---|
| **0013** | Jest 单元测试基础 | ✅ done | 3 个 service spec + 基础设施 | 11 |
| **0014** | Supertest e2e 测试 | ✅ done | auth-service 1 个完整链路 e2e + Redis mock | 7 |
| **0015**(预想) | GitHub Actions CI 集成 | 待开 | `.github/workflows/test.yml`,push 即测 | 0 |

**两条腿都站住了**:principles 轨道(0009-0012)+ testing 轨道(0013-0014)代码现在有"双层安全网"。

## nest-search 当前测试架构(0014 后)

```
nest-search/
├── apps/
│   ├── gateway/src/                          ← 单测 3 套件(11 个 it)
│   │   ├── common/http-client/
│   │   ├── guards/
│   │   └── proxy/
│   └── auth-service/                          ← e2e 1 套件(7 个 it)
│       ├── src/redis/redis-memory.service.ts   ← in-memory Redis mock(教学用)
│       └── test/auth.e2e-spec.ts              ← register/login/me 完整链路
├── jest.config.js                              ← testMatch: **/*.spec.ts + *.e2e-spec.ts
├── tsconfig.spec.json                          ← types: ["jest", "node"]
└── package.json                                ← test / test:watch / test:cov scripts
```

## 关键决策回顾 — 0014 怎么从 4 个候选里挑出来

| 候选 | 优 | 劣 | 选择 |
|---|---|---|---|
| 真 MySQL + 真 Redis | 接近 prod,无 mock 心智负担 | docker 依赖 | ✗ |
| SQLite in-memory | 极快 | Drizzle 方言差异 | ✗ |
| testcontainers | CI 友好 + 真 SQL | 配置复杂(0014 阶段太重) | ✗ |
| **真 MySQL + mock Redis** | **真 SQL 抓 bug + mock 教学价值高** | — | ✓ |

**为什么 mock Redis 不 mock MySQL**:MySQL 是 e2e 最该验证的层(SQL bug、事务、索引)。Redis 只做 refresh token 缓存,业务简单(`get/set/del`),mock 不会丢失关键测试价值。

## 给原则的反思(给 0015 + 未来 track 用)

0014 撞的 5 个反模式,根因都是"**官方教程没覆盖、StackOverflow 答案过时、TS 类型和运行时不一致**"——都属于"工具链边界"问题,不是"设计"问题。

**Lesson 设计的硬性结论**:

1. **每个 lesson 写代码章节,先 commit 进项目跑通,再写 HTML**(避免反模式 5 重演)
2. **lesson §X.0 必须有"基础设施改动"独立小节**(避免反模式 1、2 重演)
3. **lesson 引用第三方 API 时标版本号**(避免反模式 2、4 重演)
4. **lesson 演示 NestJS DI / override 时,讲清"按原 token get"**(避免反模式 3 重演)

## 副线 1 整体收获(3 条)

### 收获 1 · 真测试覆盖"业务 happy path"才有意义

0013 单测覆盖了 3 个 service 的纯逻辑,0014 e2e 覆盖了 auth-service 的用户故事。两者**互补**:
- 单测快,跑 design-level bug(逻辑错)
- e2e 慢,跑 integration bug(SQL 错、JWT 错、cookie 错)

任何一个都不能替代另一个。

### 收获 2 · mock 边界比 mock 实现重要

0014 RedisMemoryService 是个 30 行的 in-memory 实现,**关键是接口跟 RedisService 完全一致**(`get`/`set`/`del` + TTL),不是"功能完整"。

**经验法则**:mock 的价值不在"功能 1:1",在"被测代码不区分真 mock"。NestJS DI 的同 token 替换就是为此设计的。

### 收获 3 · 真 MySQL + 真 bcrypt + 真 JWT = "80% 真实"的 e2e

0014 跑通后,实际跑出的是真 SQL + 真密码哈希 + 真 token 签名。唯一 mock 的是 Redis 缓存层。

**实战价值**:这套 e2e 抓得到 "UserService.findById() 拼错字段名"、"bcrypt rounds 改了导致 hash 不匹配"、"JWT 过期时间配置错" 这类 bug。**对 NestJS 后端开发者来说够用**。

## 下一节预告

0014 把"本地 e2e"装好了。**0015 = CI 集成**:写 `.github/workflows/test.yml`,push 即跑 18 个测试 + 上报 coverage 到 Codecov。这是"代码永远绿"的最后一块拼图 + 上线前的最后一道闸。

---

**说干就开 0015 — 默认方案:GitHub Actions 免费 tier + MySQL service container + Redis service container + 自动跑 `pnpm test` + 自动上传 coverage 到 Codecov。**
