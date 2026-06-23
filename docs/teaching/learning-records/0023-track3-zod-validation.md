# 0023 — 副线 3 第 1 课:0019 Zod 配置校验反思

> 0019 是 Phase A 第 1 个,也是**新工作流**(user 写代码 + Claude review)的第 1 次实战。

## 0019 实际产出

| 项 | 内容 |
|---|---|
| 代码改动 | user 写(我 review) |
| 新文件 | 2 个:`apps/auth-service/src/config/env.schema.ts` + `validate-env.ts` |
| 改文件 | 1 个:`apps/auth-service/src/app.module.ts`(加 `validate: validateEnv`) |
| 依赖 | `zod@^4.4.3`(根 package.json) |
| 测试 | 18 passed(回归 0 break) |
| Fail-fast 实测 | ✅ DATABASE_URL=not-a-url → 启动前抛错,清晰定位 |
| Lesson | `docs/teaching/lessons/0019-zod-config-validation.md`(282 行,**改用 .md 格式**) |

## 新工作流(2026-06-23 起)的第 1 次效果

| 维度 | 之前(Claude 写) | 现在(user 写) |
|---|---|---|
| 代码"作者视角" | Claude 单方面 | user 实际写 + Claude review |
| 反模式捕获 | Claude 看不到自己的反模式 | **user 写的反模式被 Claude 抓到** |
| 学习深度 | 看 lesson 走流程 | 实际写代码 → 真踩坑 |

**这次的捕获**:user 的代码引号风格不一致(env.schema.ts 全双引号,validate-env.ts 全单引号)。这是 user 编辑器默认行为不同造成的,不算 lesson 反模式,但**work flow 改进**:以后 Claude review 时可以把引号风格统一标记出来。

## Lesson 改用 .md 格式 — 决策与影响

### 决策

0019 改用 `.md`,**不**沿用 0013-0018 的 `.html`。

### 理由

| 维度 | .html(老) | .md(新) |
|---|---|---|
| 编辑器可读 | 一般 | ✅ 极好 |
| Git diff 噪声 | 高 | ✅ 低 |
| 终端 cat | 不能 | ✅ 能 |
| 浏览器交互式 quiz | ✅ JS 自检 | ❌ 纯读 |
| 适合 workflow | 自学测验 | **新工作流:user 跟写** |

### 影响

- quiz 从"交互式"变"自检清单" — **这是好事**:自检比交互式更依赖"主动回忆",retention 更强(刻意难度原则)
- lesson 没法在浏览器打开看漂亮排版 — 但 lesson 现在是"指南",不是"展示",不需要

### 何时回归 .html

如果未来 lesson **纯讲概念不写代码**(比如 0001-0008 主线理论课),可以回归 .html。
如果 lesson **跟着写代码**(Phase A-D 全部),保持 .md。

## 撞到的 3 个 lesson 反模式(我刚犯)

### 反模式 1 · 写了完整示例代码在 lesson 里

**症状**:`env.schema.ts` 几乎逐字照抄 lesson §4.2。

**反模式**:lesson 给"模板" = 学员会"抄模板"。抄的代码不是真理解的。

**正确做法**:lesson 应该给"设计 + 关键 API"而不是完整文件。比如:

```ts
// ❌ 错的(给了完整代码):
export const AuthEnvSchema = z.object({
  NODE_ENV: z.enum([...]).default(...),
  LOG_LEVEL: z.enum([...]).default(...),
  // ... 11 个字段
});

// ✅ 更好的(给设计 + 1-2 个示例):
// 设计决策:
// - NODE_ENV / LOG_LEVEL 用 enum(限定取值)
// - 端口用 coerce.number()(类型安全 + 校验在前)
// - JWT_SECRET 必须 ≥16 字符(安全)
// - 其他 string 默认值用 .default()
// 参考 zod 文档,自己写 schema
```

**改进方向**:0020 起 lesson 只给"设计原则 + 关键 API + 字段清单",不写完整 schema。

### 反模式 2 · 引用 zod 4.x 但 lesson 没标版本

**症状**:user 装 `zod@^4.4.3`(zod 4.x),但 lesson 示例代码里有些语法是 zod 3 风格(`.parse()` vs `safeParse()` 等)。

**反模式**:lesson 没说"以下示例基于 zod 4.x"。

**正确做法**:lesson §2.1 加一句"以下示例基于 zod 4.x,语法跟 3.x 略有差异,看 https://zod.dev/v4/changelog"。

### 反模式 3 · fail-fast 实测时 lsof 兜底仍漏

**症状**:`DATABASE_URL=not-a-url pnpm start:auth` 后,kill nest start 父进程,端口 3004 残留。

**复用 0017 经验**:`kill $PID` 不够,`kill -- -$PID` 对 nest cli 也不一定生效。**lsof 兜底是必备**。

lesson §4.5 的命令应该加:
```bash
lsof -ti :3004 -P | xargs kill -9 2>/dev/null
```

**改进方向**:lesson §X.5 的"清理命令"统一加 lsof 兜底。

## user 代码 review

### ✅ 好的地方

1. **11 个字段全覆盖** — 没漏
2. **关键 API 用对**:
   - `z.coerce.number()` 端口
   - `z.string().min(16)` JWT_SECRET(安全考量)
   - `z.enum([...])` NODE_ENV / LOG_LEVEL
   - `.default()` 而非 `||`
3. **`safeParse` + 结构化错误 log** — 不是 `parse()` 抛 raw 错
4. **`throw new Error(...)` 带字段名** — 排障友好
5. **`Record<string, unknown>` 入参** — TS 严格

### ⚠️ 可改进

1. **引号风格不一致**(env.schema.ts 全双引号,validate-env.ts 全单引号)— 建议统一
2. **`AUTH_SERVICE_PORT` 写了校验但 `main.ts` 没用** — 校验完值没消费,白干(下面 §"小问题"详述)

### 小问题:`AUTH_SERVICE_PORT` 没用

**观察**:`AuthEnv` 类型导出,但 `apps/auth-service/src/main.ts` 还是用 `process.env.AUTH_SERVICE_PORT || '3004'`,**没用 ConfigService 拿校验过的值**。

**为什么不立刻改**:
- 0019 范围 = "装上 Zod 校验",不是"全面重构 main.ts 读 ConfigService"
- 改 main.ts 会触及 lesson 范围外的东西

**后续方向**:
- 0020(推广到其他服务)可以顺便统一:`main.ts` 改用 `ConfigService.get('PORT')`
- 或者单独开一节 "ConfigService vs process.env" 专讲这个反模式

## nest-search 当前全景(0019 后)

```
gateway         ✅ pino + Swagger + ...        ← 0018 已对齐
auth-service    ✅ pino + Zod 校验 (NEW 0019)  ← Phase A 第 1
search-service  ✅ pino                         (0016)
sync-service    ✅ pino                         (0017)
form-service    ✅ pino                         (0017)
```

**5/5 服务 pino + 1/5 服务 Zod 校验**。

## 0020 预告 · Zod 推广 + 公共 schema 抽取

按 CURRICULUM 计划,0020 应该是:

| 主题 | 备注 |
|---|---|
| **gateway / search / sync / form 4 个服务都加 Zod schema** | 复用 0019 模板,但 service 字段少 |
| **抽公共 schema 到 `libs/shared/config/`** | `BASE_ENV_SCHEMA`(NODE_ENV / LOG_LEVEL 公共)+ 每个 service 自己的 extend |
| **env.example 模板** | 给新部署的人参考 |

**预计 0020 + 0021 一起把 5 个服务 + 公共 schema 都装齐**。

## 给自己的反思

### 反思 1 · 新工作流暴露的真问题

旧工作流(我写代码)的盲点是**我看不到自己的反模式**。
新工作流(user 写代码)的盲点是**lesson 写太多 = user 抄太多**(反模式 1)。

**结论**:**lesson 应该写"决策 + API"不写"完整文件"**。下次写 lesson 我会注意。

### 反思 2 · 引号风格 / 格式 — 工具链问题

user 的代码引号不一致,根因是 **editor / Prettier 配置**。这是项目级 prettier config 应该解决的问题,不该每次 review 提。

**改进方向**:`package.json` 加 prettier config(目前没),或者直接让 user 配 editor。

### 反思 3 · "校验了不消费" 是企业代码常见反模式

`AUTH_SERVICE_PORT` 校验了但 main.ts 没读校验后的值 — 这种"防御性配置"在企业代码里很常见。

**为什么会出现**:开发者对"校验"和"使用"是两个心智,不容易想到"既然有 ConfigService 了,main.ts 为什么不读它"。

**Lesson 改进**:0020 推广时,可以专门写一节 "ConfigService vs process.env"。

---

## 下一节预告

**0020 = Zod 推广到剩下 4 个服务 + 抽公共 schema**。

我会改进 lesson:
- §4 不再写完整 schema,只给字段清单 + 关键 API
- §5 加 zod 4.x 版本说明
- §6 清理命令统一 lsof 兜底
