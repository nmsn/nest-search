# 0021 · env.example + 配置文档化 + process.env 收敛

> 副线 3(配置校验)第 3 课。0019+0020 装了 Zod 校验,这节做"开发者体验"——新成员 onboarding 30 秒能配齐 5 个 service。

## 导航

- **上一课** · [0020 Zod 推广到 5 个服务 + 公共 schema 反思](./0020-zod-promote-shared-schema.md) — 撞了 monorepo 跨包 4 个问题,最终回退 inline
- **当前课** · 0021(本文件)— env.example + CONFIG.md + 部分 process.env 收敛
- **下一课** · [0022 Drizzle 深度 第 1 课](0022-drizzle-schema-relations.md) — Phase A 第 2 个(副线 4)
- **相关 LR** · [LR-0024 副线 3 monorepo 踩坑反思](../learning-records/0024-track3-zod-monorepo-friction.md)
- **相关参考** · [CURRICULUM.md 总体设计](../CURRICULUM.md) · [MISSION.md 项目使命](../MISSION.md)
- **本课产物**:
  - [docs/CONFIG.md](../../CONFIG.md)(本课新建)
  - `apps/{gateway,auth,search,sync,form}-service/.env.example`(本课新建 5 个)
  - `apps/auth-service/src/main.ts`(本课改:ConfigService.get)
  - `apps/auth-service/src/database/drizzle.service.ts`(本课改:ConfigService 注入)

## 你今天会拿到什么

1. **5 个 `.env.example`** — 每个 service 一个,列所有 env 字段 + 默认值 + 用途
2. **`docs/CONFIG.md`** — 统一配置文档,跨 service 字段表
3. **process.env 收敛** — 替换部分直接 `process.env.X` 改为 `ConfigService.get(...)`(选 1-2 个 service 做示范,**不全量做**)
4. **总验证**:5 个 service 都能 fail-fast + 18 测试还过 + 1 个 commit

## 1. 为什么需要 .env.example + CONFIG.md

0019+0020 的现状:
- Zod 校验装好了 — **env 错了会 fail-fast**
- 但**新成员不知道哪些 env 是必需的**

**问题场景**:新人 clone nest-search 跑 `pnpm start:gateway`,启动失败:

```
Error: Environment validation failed: JWT_SECRET
```

新人困惑:**JWT_SECRET 从哪来?默认值是什么?哪些 service 也要?**

**解决**:
- `.env.example` — 每个 service 一个,跟代码同仓,**README-like**
- `docs/CONFIG.md` — 跨 service 字段总表 + 安全/默认约定

## 2. 设计决策(0021 前先想清楚)

### 决策 1 · 5 个 .env.example 还是 1 个根 .env.example?

**A**:每个 service 自己一个 `apps/<svc>/.env.example`
**B**:项目根一个 `.env.example`,所有 service 共用

**选 A**。理由:
- 每个 service 的 env 是独立的(端口 / DB 名 / 业务字段都不同)
- 部署时也是分开配的(每个 service 一个容器 / 一个环境)
- 跟 nest-search monorepo "每个 app 一个 deployment unit" 模式对齐

### 决策 2 · .env.example 要写默认值的真值还是说明?

**A**:写真实默认值(跟 Zod schema 的 `.default()` 一致)
**B**:写真实默认值 + 用途说明

**选 B**。一个新人看 .env.example,要知道:
- 这个变量干嘛的(用途)
- 不填的话默认值是啥(默认值)
- 哪些 service 用这个变量(共享还是私有)

### 决策 3 · process.env 收敛做几个 service?

nest-search 现在有 **20+ 个 process.env 直接引用**(grep `apps/*/src/`)。全量收敛 scope 太大。

**0021 选 2 个做示范**:`auth-service/src/main.ts` + `auth-service/src/database/drizzle.service.ts`(用 ConfigService.get 替代 process.env)。**其他 service 留到后续 lesson**。

为什么选这 2 个:
- `main.ts` 的 `AUTH_SERVICE_PORT` — 0019 LR 提到的"校验了不消费"的代表
- `drizzle.service.ts` 的 `DATABASE_URL` — 真正连接 DB,出错代价高

### 决策 4 · ConfigService.get 的类型怎么保证?

`ConfigService.get<T>(key)` 默认返回 `T | undefined`,容易出 TS error。

**NestJS 11 + nestjs-zod 推荐做法**:
```ts
import { ConfigService } from '@nestjs/config';
import type { AuthEnv } from './config/env.schema';

// 写一个 typedConfigService 工厂:
// (留给你设计 — 见 §3.3)
```

或者直接 `ConfigService.get<AuthEnv>('DATABASE_URL')` + `as string` 断言。

## 3. 动手步骤

### 3.1 · 创建 5 个 .env.example

每个 service 一个。**字段清单**(参照 0020 lesson §4 + 0020 actual inline schema):

#### `apps/gateway/.env.example`

```bash
# === 公共字段(其他 4 个 service 也有,详见 docs/CONFIG.md) ===
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=change-me-to-something-secure-at-least-16-chars
JWT_EXPIRES_IN=2h
CAS_COOKIE_DOMAIN=.example.local
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s

# === gateway 私有 ===
GATEWAY_PORT=3000
API_KEY_DS=ds_key_123
API_KEY_ZK=zk_key_456
API_KEY_MEETING=meeting_key_789
AUTH_SERVICE_URL=http://localhost:3004
SEARCH_SERVICE_URL=http://localhost:3002
SYNC_SERVICE_URL=http://localhost:3001
FORM_SERVICE_URL=http://localhost:3003
REFRESH_TOKEN_EXPIRES_IN=604800
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

#### `apps/auth-service/.env.example`

```bash
# === 公共字段 ===
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=change-me-to-something-secure-at-least-16-chars
JWT_EXPIRES_IN=2h
CAS_COOKIE_DOMAIN=.example.local
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s

# === auth-service 私有 ===
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/nest_search
REDIS_HOST=localhost
REDIS_PORT=6379
REFRESH_TOKEN_EXPIRES_IN=604800
AUTH_SERVICE_PORT=3004
```

#### `apps/search-service/.env.example`

```bash
# === 公共字段 ===
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=change-me-to-something-secure-at-least-16-chars
JWT_EXPIRES_IN=2h
CAS_COOKIE_DOMAIN=.example.local
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s

# === search-service 私有 ===
SEARCH_SERVICE_PORT=3002
ELASTICSEARCH_NODE=http://localhost:9200
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

#### `apps/sync-service/.env.example`

```bash
# === 公共字段 ===
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=change-me-to-something-secure-at-least-16-chars
JWT_EXPIRES_IN=2h
CAS_COOKIE_DOMAIN=.example.local
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s

# === sync-service 私有 ===
SYNC_SERVICE_PORT=3001
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/nest_search
ELASTICSEARCH_NODE=http://localhost:9200
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

#### `apps/form-service/.env.example`

```bash
# === 公共字段 ===
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=change-me-to-something-secure-at-least-16-chars
JWT_EXPIRES_IN=2h
CAS_COOKIE_DOMAIN=.example.local
CAS_TGT_EXPIRES_IN=8h
CAS_ST_EXPIRES_IN=30s

# === form-service 私有 ===
FORM_SERVICE_PORT=3003
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/nest_search
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### 3.2 · 创建 `docs/CONFIG.md`

统一文档。结构:

```markdown
# nest-search 配置总览

> 所有 5 个 service 用 env 变量。Zod 校验在启动时检查(0019+0020 装)。
> 失败:服务不启动,log 告诉你哪个字段错了。

## 字段总表

| 字段 | 类型 | 默认 | 用在 | 说明 |
|---|---|---|---|---|
| `NODE_ENV` | enum | development | all 5 | dev / test / production |
| `LOG_LEVEL` | enum | info | all 5 | error / warn / info / debug |
| `JWT_SECRET` | string(≥16) | (无默认,必须设) | gateway/auth/search/sync/form | JWT 签名密钥,生产必须改 |
| ... | ... | ... | ... | ... |

## 共享字段 vs 私有字段

### 共享字段(所有 service 都有)

NODE_ENV / LOG_LEVEL / JWT_SECRET / JWT_EXPIRES_IN /
CAS_COOKIE_DOMAIN / CAS_TGT_EXPIRES_IN / CAS_ST_EXPIRES_IN

### 私有字段

每个 service 自己的端口 / 业务字段,见各 service 的 `.env.example`。

## 安全约定

- JWT_SECRET 生产必须用 `openssl rand -hex 32` 生成,**绝对不能**用默认占位符
- DATABASE_URL 含密码,生产用 secret manager(vault / k8s secret / etc.)
- RABBITMQ_URL 含密码,同上

## 新成员 onboarding 步骤

1. cp apps/gateway/.env.example apps/gateway/.env
2. cp apps/auth-service/.env.example apps/auth-service/.env
3. ... (5 个都 cp)
4. 编辑 .env,改 JWT_SECRET 为自己生成的(其他可以保留默认)
5. pnpm docker:up
6. pnpm test
7. pnpm start:all
```

### 3.3 · process.env 收敛示范(auth-service 2 个文件)

#### 改 `apps/auth-service/src/main.ts`

**之前**:
```ts
const port = process.env.AUTH_SERVICE_PORT || 3004;
```

**之后**:
```ts
const port = app.get(ConfigService).get('AUTH_SERVICE_PORT', 3004);
```

**前提**:app 已经 `await NestFactory.create(AppModule)`。

#### 改 `apps/auth-service/src/database/drizzle.service.ts`

**之前**:
```ts
async onModuleInit() {
  const pool = createPool({
    uri: process.env.DATABASE_URL || 'postgresql://...',
  });
  // ...
}
```

**之后**(通过 DI 注入 ConfigService):
```ts
@Injectable()
export class DrizzleService implements OnModuleInit {
  public db!: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const pool = createPool({
      uri: this.config.getOrThrow<string>('DATABASE_URL'),
    });
    // ...
  }
}
```

**为什么用 `getOrThrow`**:Zod 已经校验过 DATABASE_URL 存在,这里应该 throw 而不是用 default。

### 3.4 · 跑测试

```bash
pnpm test
```

期望:`Test Suites: 4 passed / Tests: 18 passed`。

### 3.5 · 总验证 — 5 个 service fail-fast

每个 service 跑一次 fail-fast,确认 0020 的 Zod 校验在每个 service 都能拦错:

```bash
DATABASE_URL="not-a-url" pnpm start:auth    # auth 报 DATABASE_URL 错
ELASTICSEARCH_NODE="not-a-url" pnpm start:search    # search 报 ELASTICSEARCH_NODE
SYNC_SERVICE_PORT="not-a-num" pnpm start:sync    # sync 报 SYNC_SERVICE_PORT
FORM_SERVICE_PORT="not-a-num" pnpm start:form    # form 报 FORM_SERVICE_PORT
GATEWAY_PORT="not-a-num" pnpm start:gateway    # gateway 报 GATEWAY_PORT

# 清理(必带 lsof 兜底):
kill $PID 2>/dev/null
sleep 1
lsof -ti :3000 -i :3001 -i :3002 -i :3003 -i :3004 -P | xargs kill -9 2>/dev/null
```

## 4. 设计自由度

- **`.env.example` 字段说明的详略**:你定(可以比 lesson 更详尽)
- **`docs/CONFIG.md` 表格格式**:markdown table / 自定义结构
- **process.env 收敛做不做更多 service**:0021 只示范 auth-service 2 个文件,**其他 0022+ 再做**
- **`getOrThrow` vs `get + as string`**:风格选择

## 5. 自我检测(3 道题)

<div class="quiz">
  <div class="quiz-q" data-correct="b">
    <p>1. 为什么 .env.example 写真实默认值 + 用途说明(不只是字段名)?</p>
    <label class="quiz-opt"><input type="radio" name="q1" value="a"> 让文件更长</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="b"> 新成员 onboarding 时知道"这字段干嘛 + 不填会怎样 + 哪些 service 用",不用 grep 代码</label>
    <label class="quiz-opt"><input type="radio" name="q1" value="c"> 行业惯例</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="c">
    <p>2. process.env 收敛时用 <code>getOrThrow</code> 而不是 <code>get + ??</code> 默认值,为什么?</p>
    <label class="quiz-opt"><input type="radio" name="q2" value="a"> getOrThrow 性能更好</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="b"> get 有 bug</label>
    <label class="quiz-opt"><input type="radio" name="q2" value="c"> Zod 启动时已经校验过必填字段,getOrThrow 强制保证"启动后所有取 env 都不会是 undefined",运行时类型安全</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>

  <div class="quiz-q" data-correct="a">
    <p>3. 0021 为什么不全量收敛所有 process.env(只示范 auth-service 2 个)?</p>
    <label class="quiz-opt"><input type="radio" name="q3" value="a"> scope 控制 — 全量收敛 20+ 个文件会超 0021 lesson 范围,分批做更可控(后续 lesson 继续)</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="b"> 不需要</label>
    <label class="quiz-opt"><input type="radio" name="q3" value="c"> Zod 已经校验了,不需要 ConfigService</label>
    <button onclick="check(this)">提交</button>
    <div class="quiz-feedback"></div>
  </div>
</div>

## 6. commit message(直接复制)

```
feat(docs): env.example + CONFIG.md + process.env partial migration (0021)

Add per-service .env.example (5 files):
- apps/{gateway,auth,search,sync,form}-service/.env.example
- Each lists public fields (NODE_ENV / LOG_LEVEL / JWT_SECRET /
  JWT_EXPIRES_IN / CAS_*) + service-private fields with real
  default values + brief usage notes

Add docs/CONFIG.md:
- Cross-service field table (公共 + 私有)
- Security conventions (JWT_SECRET must be generated, DATABASE_URL
  password handling)
- Onboarding steps for new contributors

Partial process.env migration (auth-service only, 2 files):
- apps/auth-service/src/main.ts: use ConfigService.get('AUTH_SERVICE_PORT')
  instead of process.env
- apps/auth-service/src/database/drizzle.service.ts: inject
  ConfigService via constructor, use config.getOrThrow('DATABASE_URL')
- Other services deferred to subsequent lessons (scope control)

Verified:
- pnpm test 18/18 pass
- 5 services each fail-fast on bad env:
  - DATABASE_URL=not-a-url → auth-service reports DATABASE_URL
  - ELASTICSEARCH_NODE=not-a-url → search-service reports ELASTICSEARCH_NODE
  - SYNC_SERVICE_PORT=not-a-num → sync-service reports SYNC_SERVICE_PORT
  - FORM_SERVICE_PORT=not-a-num → form-service reports FORM_SERVICE_PORT
  - GATEWAY_PORT=not-a-num → gateway reports GATEWAY_PORT

Lesson 0021 docs/teaching/lessons/0021-env-example-and-config-docs.md
LR-0025: 副线 3 收官 — onboarding + scope 分批

Refs: docs/teaching/lessons/0021-env-example-and-config-docs.md
```

## 7. 收口 checklist

- [ ] 3.1 创建 5 个 `.env.example`(对照 lesson 模板)
- [ ] 3.2 创建 `docs/CONFIG.md`(字段总表 + onboarding 步骤)
- [ ] 3.3 改 `auth-service/src/main.ts` 用 ConfigService
- [ ] 3.3 改 `auth-service/src/database/drizzle.service.ts` 用 ConfigService
- [ ] 3.4 `pnpm test` 18 passed
- [ ] 3.5 5 个 service fail-fast 总验证(必带 lsof 兜底清理)
- [ ] 3 道 quiz 答完
- [ ] commit(用上面 message)

**做完后告诉我结果**,0021 是副线 3 收官,我开 LR-0025 + 副线 4(Drizzle 深度,0022-0024)。
