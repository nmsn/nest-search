# 0019 — 副线 1(测试体系)总收官 + 0015 撞到的反模式

> 0015 是副线 1(测试体系)的最后一课(也是收官)。这一篇记录 0015 + 整个 testing 轨道(0013-0015)的总结,给下一个 track 留接口。

## 0015 实际产出

| 项 | 内容 |
|---|---|
| Commit | (next) `ci: add GitHub Actions workflow for unit + e2e tests (0015)` |
| 文件 | 2 个: `.github/workflows/test.yml`、`0015-github-actions-ci.html` |
| CI 闸口 | push 到 main / 所有 PR 自动跑 18 个测试 |
| Service container | 真 MySQL 8.0 + 真 Redis 7-alpine(端口映射 localhost) |
| 加速 | pnpm cache 命中 + concurrency cancel-in-progress |
| Lesson | 290 行 HTML,5 章节 + 3 道 quiz + commit message |

**核心交付**:nest-search 第一次有了"代码永远绿"闸口 — push 1 分钟内知道测试有没有挂,跟本地有没有 docker 解耦。

## 撞到的反模式(4 条)

### 反模式 1 · 用 `mysql:latest` / `redis:latest`

**症状**:想偷懒,写 `image: mysql:latest` / `image: redis:latest`,省去选版本的工作量。

**反模式**:`latest` 标签在 Docker Hub 上**会变**。今天 CI 跑的是 MySQL 8.0,明天维护者推 MySQL 8.1 → 8.4 → 9.0,你 CI 跑出来的 SQL 行为可能跟本地完全不同,debug 起来噩梦。

**正确做法**:锁版本:

```yaml
image: mysql:8.0       # ← 锁住
image: redis:7-alpine  # ← 锁住
```

### 反模式 2 · CI 跟本地 DATABASE_URL 不一致

**症状**(没真的撞,提前规避):CI 里 MYSQL_ROOT_PASSWORD 设了新密码 `ci_password_123`,但 `apps/auth-service/src/database/drizzle.service.ts` 默认连 `mysql://root:root123@...`。结果 CI 跑测试时 mysql2 报 auth 失败。

**反模式**:CI 配置跟业务代码"分离心"。CI 应该**复用**业务代码的默认连接信息,而不是反过来改业务代码去适配 CI。

**正确做法**:让 CI 跟本地用<strong>同一个 root 密码 + 同一个 db 名</strong>:

```yaml
MYSQL_ROOT_PASSWORD: root123       # 跟 apps/auth-service 默认 DATABASE_URL 匹配
MYSQL_DATABASE: nest_search       # 同上,自动建库
```

这样业务代码在 CI / 本地 / staging / prod <strong>连接参数零差异</strong>。换 prod 时只在 prod 注入不同 env,本地不动。

### 反模式 3 · Healthcheck 通过 ≠ MySQL 真能接连接

**症状**(理论):MySQL container 的 healthcheck 报 healthy,但 DrizzleService 第一次 connect 时还是 `ECONNREFUSED` — 因为 mysql8 启动后**还有内部 init 步骤**(建库 + 初始化用户表)。

**反模式**:只信 healthcheck,直接跑下一步。

**正确做法**:加 wait loop 兜底:

```bash
for i in {1..30}; do
  if mysqladmin ping -h 127.0.0.1 -uroot -proot123 --silent 2>/dev/null; then
    echo "MySQL is ready"; break
  fi
  sleep 1
done
```

**LR-0018 提到的"双保险"在 CI 才有意义**:本地是手动 docker-compose up,init 完才会跑测试;CI 是自动启 + 自动测,缝隙更大。

### 反模式 4 · 没设 concurrency,CI 跑满分钟

**症状**:开发者 push 5 次改 typo,每次都排队 1-2 分钟等 CI。GitHub Actions 免费额度(每月 2000 分钟)被吃掉一半是浪费在"等被取消的旧 run"。

**反模式**:让所有 push 都独立排队跑。

**正确做法**:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

同 ref(分支)的 run 自动取消上一个。<strong>小细节省大钱</strong>。

## 副线 1(测试)完整全景 + 节奏

| 课 | 主题 | 状态 | 关键产出 | 测试数 |
|---|---|---|---|---|
| **0013** | Jest 单元测试基础 | ✅ | jest.config.js + tsconfig.spec.json + 3 个 spec | 11 |
| **0014** | Supertest e2e 测试 | ✅ | RedisMemoryService + 1 个 e2e 完整链路 | 7 |
| **0015** | GitHub Actions CI 集成 | ✅ | .github/workflows/test.yml + service containers | 0(自动化跑上面的) |
| **总计** | **双层安全网 + 自动闸口** | ✅ | **18 测试 + push 即跑** | 18 |

**副线 1 收官**。所有原则 + 测试轨道代码现在有:
1. **单元测试层**(0013)— 抓 design-level bug,毫秒级
2. **e2e 测试层**(0014)— 抓 integration bug,百毫秒级
3. **CI 闸口**(0015)— push 即跑全 18 个 + 上传 coverage

## nest-search 当前测试架构(0015 后)

```
nest-search/
├── .github/
│   └── workflows/
│       └── test.yml                ← CI 闸口(push 即跑)
├── apps/
│   ├── gateway/src/                ← 单测 3 套件(11 it)
│   │   ├── common/http-client/
│   │   ├── guards/
│   │   └── proxy/
│   └── auth-service/               ← e2e 1 套件(7 it)
│       ├── src/redis/redis-memory.service.ts
│       └── test/auth.e2e-spec.ts
├── jest.config.js                  ← testMatch: **/*.spec.ts + *.e2e-spec.ts
├── tsconfig.spec.json              ← types: ["jest", "node"]
└── package.json                    ← test / test:watch / test:cov scripts
```

## 给原则的反思 — Lesson 设计的 4 条铁律

0013-0015 撞了 14 个反模式,根因都是"**lesson 设计没把工具链边界讲清**"。提炼成 4 条铁律:

### 铁律 1 · 每个 lesson 写代码章节,先 commit 跑通,再写 HTML

0013 (反模式 4: 数字 12 vs 11)、0014 (反模式 5: lesson 没验真)都栽在这里。

**正确流程**:
```
1. 设计 lesson 章节大纲
2. 写代码 → 真跑 → 看输出 → 修
3. 把"真输出"贴进 lesson HTML
4. commit
```

### 铁律 2 · Lesson §X.0 必须有"基础设施改动"独立小节

0013 (反模式 5: jest.config.js 引 tsconfig 没解释)、0014 (反模式 1: testMatch 没显式)都栽在这里。

**正确结构**:
```
§4.0 · 准备:扩展 jest + 加 supertest
§4.1 · Mock RedisService
§4.2 · 写 e2e 测试
```

§4.0 专门讲"这一节要改哪些基础设施 + 为什么"。

### 铁律 3 · Lesson 引用第三方 API 必须标版本号

0014 (反模式 2: supertest 7.x import 改了)栽在这里。

**正确写法**:
```
import request from 'supertest';  // ← supertest 7.x 是 default export
```

### 铁律 4 · Lesson 演示 NestJS DI / override 时讲清 token get 规则

0014 (反模式 3: moduleRef.get(NewClass) 返 undefined)栽在这里。

**正确写法**:
```
// override 之后,用原 token 拿,不是新 class
redis = moduleRef.get(RedisService) as RedisMemoryService;
```

## 副线 1 整体收获(4 条)

### 收获 1 · 测试基础设施 vs 业务测试是两件事

0013 + 0014 一共撞了 10 个反模式,其中 **7 个是基础设施**(jest config / tsconfig / import / moduleRef / glob),3 个是业务(mock 选择 / DTO / cookie)。

**结论**:Lesson 必须把"devops 工程"和"设计选择"分开讲,否则初学者搞不清"哪里是配置,哪里是设计"。

### 收获 2 · 真测试覆盖率 100% 才有意义

0013 + 0014:
- RolesGuard / ProxyService / HttpClientService:100% coverage(单测)
- auth-service e2e:覆盖 register/login/me/refresh/logout 全链路

**没有覆盖率报告的测试 = 自欺欺人**。<code>pnpm test:cov</code> 必跑。

### 收获 3 · CI 是"团队契约"不是"个人工具"

CI 跑通 ≠ 你代码好。
CI 跑通 = **你同事 push 代码后也不会 break master**。

这是 0015 真正的价值 — 不是"自动化测试",是"团队契约"。

### 收获 4 · 副线 1 是其他所有副线的前置

0013-0015 装好了测试基础设施。**副线 2(跨服务迁移) / 副线 3(Docker / K8s) / 副线 4(配置管理)** 都会改业务代码,都需要"测试保护"。

**结论**:副线 1 必须先做。原则 4 节 + 测试 3 节 = 7 节打底,后面副线才有空间写。

## 副线 1 → 副线 2 衔接

副线 2(跨服务迁移)预计 2-3 节:
- 0016: auth-service 装 pino 结构化日志(对齐 gateway 0005)
- 0017: search / form / sync-service 装 Swagger + DTO validation(对齐 gateway 0011)
- 0018: 全部服务装 healthcheck + rate limiting(对齐 gateway 0007)

**每节都会复用副线 1 的测试基础设施**:改完业务代码 → `pnpm test` 跑 18 个 → 知道有没有 break。

---

**说干就开副线 2 — 默认:先 0016(auth-service 加 pino),理由:auth-service 是 nest-search 最关键的服务(所有前端登录都过它),先做它收益最大。**
