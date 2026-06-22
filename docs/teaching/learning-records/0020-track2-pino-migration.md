# 0020 — 副线 2(跨服务迁移)第 1 课:0016 pino 反思 + 模式

> 0016 把 gateway 的 pino 模式搬到 search-service。这一篇记录"模式迁移"的心智模型 — 跟 principles 轨道(发明)和副线 1(测试基建)都不一样。

## 0016 实际产出

| 项 | 内容 |
|---|---|
| Commit | (next) `feat(search-service): migrate pino structured logging from gateway (0016)` |
| 文件 | 2 个: `apps/search-service/src/app.module.ts`、`0016-search-pino-migration.html` |
| 代码改动 | **10 行新增** — 1 个 import + 1 个 LoggerModule.forRoot 块 |
| 业务逻辑改动 | **0** |
| 测试影响 | **0 测试添加, 0 测试 break** — 18 passed → 18 passed |
| Lesson | 230 行 HTML,5 章节 + 3 道 quiz + commit message |

**核心交付**:search-service 从"裸 NestJS console.log"升级成"pino 全栈对齐"。

## 0016 的特殊性 — "模式迁移" 不等于"新功能"

副线 1(测试基建)的反模式 14 条都是"踩坑",副线 2(跨服务迁移)的第 1 课是**没有反模式**。原因是:

> **0016 不是发明,是搬运。**

| 维度 | principles 轨道(0009-0012) | 副线 1(测试) | 副线 2(0016) |
|---|---|---|---|
| **本质** | 发明新模式 | 建基础设施 | 搬运已有模式 |
| **代码来源** | 写新代码 | 写新代码 + 配置 | **复制粘贴 + 微调** |
| **决策点** | 多(选哪种模式) | 中(配 jest/tsconfig) | **少**(几乎照搬) |
| **风险** | 高(新模式可能错) | 中(工具链边界) | **低**(已验证模式) |
| **Lesson 重点** | 设计思路 | 工具链陷阱 | **心智模型 + 一致性** |

**Lesson 设计含义**:0016 的 §3 只有 3.1 一个动手章节 — 没有 4.1 / 4.2 / 4.3 / 4.4 像 0013 / 0014 那么多。**少 ≠ 内容稀**,少是因为"决策少"。

## 0016 的 4 个关键决策(都是"延续",不是"创新")

### 决策 1 · 完全照搬 gateway 的 4 个 pino 配置

```ts
genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
customProps: (req) => ({ requestId: req.id }),
autoLogging: false,
```

**为什么不改**:
- `genReqId` 改了 → gateway 传来的 requestId 在 search-service 对不上号,跨服务追踪断
- `customProps` 改了 → 字段名不一致,日志聚合工具(loki / ELK)聚合失败
- `autoLogging` 改了 → 日志量爆炸或日志缺关键事件

**经验法则**:跨服务迁移 = **配置参数零差异**,否则破坏"一致性"。

### 决策 2 · 在 `ConfigModule.forRoot` 之后立刻放

```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),  // ← 第一:全局 env
  LoggerModule.forRoot({...}),                // ← 第二:全局 logger
  ElasticsearchModule,                       // ← 第三:业务 module
  SearchModule,
]
```

**为什么**:gateway 是这个顺序,search-service 也保持。<strong>顺序一致性 = "一眼能看出两个服务结构相同"</strong>。

### 决策 3 · 不写 search-service 自己的 e2e

**直觉**:既然改了 search-service,应该写个 search-service 的 e2e。

**反直觉的正确做法**:**不写**。理由:
- 0016 改的是 module-level 配置,**没碰任何 service / controller 业务**
- 现有 18 测试覆盖的边界(auth-service e2e + 3 个 service 单测)没动
- 加 e2e 反而引入新边界,测试金字塔变畸形(测试覆盖 ≠ 100% 才是健康)

**经验法则**:每加一个测试前问"这个测试覆盖的是新加的代码,还是重复已覆盖的边界?"

### 决策 4 · 不引入"SearchServiceLogger"抽象

**直觉**:既然 4 个服务都要 pino,应该写一个 `shared/logger.module.ts` 给所有服务共用。

**反直觉的正确做法**:**不要**。理由:
- 当前就 4 行配置(`genReqId` / `customProps` / `autoLogging` / `level`),抽出来反而**间接层数 +1,理解成本 +10**
- 等以后真的有第 2 个差异点(比如 prod 要 `redact: ['*.password']`),再抽
- 现在的代码复制粘贴 4 遍,比"过早抽象"便宜

**经验法则(WET 原则)**:**W**rite **E**verything **T**wice — 重复 2 次再考虑 DRY。

## nest-search 当前状态(0016 后)

```
gateway        ✅ pino  + Swagger + Roles + Throttler + ProxyModule  (0005/0011/0012)
auth-service   ✅ pino  + Redis + Drizzle                              (主线收官)
search-service ✅ pino  ← 0016 NEW                                     (副线 2 第 1 课)
sync-service   ❌ 裸 logger                                            (0017 待)
form-service   ❌ 裸 logger                                            (0017 待)
```

**进度**:4/5 服务已对齐 pino(80%)。剩 sync + form 2 个。

## 副线 2 节奏 + 心智模型

| 课 | 主题 | 状态 | 关键改动 |
|---|---|---|---|
| **0016** | search 加 pino | ✅ done | 10 行 module 配置 |
| **0017**(预想) | sync + form 加 pino | 待开 | 同 0016,复制 2 次 |
| **0018**(预想) | 全部服务加 healthcheck + Swagger | 待开 | 复制 3-4 次 + 真业务改动 |

**副线 2 总原则**:
> **"新功能先在 gateway 跑通 → 复制到其他 N 个服务"。**<br>
> **"只改必要差异(端口/数据库名),不改跨服务一致配置"。**

## 给自己的反思(给 0017 + 0018 用)

### 反思 1 · 副线 2 是"无聊的胜利"

副线 1(测试)撞了 14 个反模式,Lesson 设计刺激、有收获感。

副线 2(迁移)几乎"没坑",靠的是 principles 轨道的"设计充分"。<strong>这是好事 — 越无聊 = 越证明基础扎实</strong>。

**Lesson 设计含义**:0017 / 0018 可能更短(因为几乎"无内容")。不要为了"凑课时"硬加内容。**无聊也是 lesson 的一种成功**。

### 反思 2 · 一致性的隐性价值

0016 改完 search-service 后,我**第一次能在 4 个服务的日志里搜同一个 `x-request-id`** — 这是迁移前做不到的。

**结论**:**"一致性"的价值不在当下,在未来某次事故排查**。等线上出问题,3 分钟跨服务定位 vs 3 小时 grep,差别巨大。

### 反思 3 · "复制粘贴" 在工程里的合法地位

写代码时教科书都教 DRY(Don't Repeat Yourself),但 0016 的 4 行配置就是该复制。

**经验法则**:
- **业务逻辑重复** → DRY(抽函数 / 抽 module)
- **配置重复** → WET(直接复制,直到第 2 个差异点出现)
- **模式重复** → 抽"心智模型"进 lesson,代码仍复制

## 下一节预告

**0017 = 复制 2 次**:把 0016 同一段 pino 配置分别贴到 sync-service 和 form-service。预计 10 分钟一服务,20 分钟全做完。Lesson 会极简。

---

**说干就开 0017 — 默认:同 0016 模式,只贴代码 + 跑 pnpm test 确认 18 passed 不变。**
