# 0024 — 副线 3 第 2 课:0020 Zod 推广 + monorepo 跨包踩坑反思

> 0020 的"抽公共 schema 到 libs/shared"撞了 nest-search monorepo 的基础设施缺口,**最终回退到 inline**。这是 LR-0023 lesson 设计预言之外的实操反模式。

## 0020 实际产出

| 项 | 内容 |
|---|---|
| 新文件 | 4 个 service 各自:`env.schema.ts` + `validate-env.ts`(共 8 个) |
| 改文件 | 5 个 service `app.module.ts` + auth-service `env.schema.ts` |
| 最终决定 | **inline 公共字段,不抽 libs/shared**(见下面反思) |
| 测试 | 18 passed(0 break) |
| Fail-fast | search + form 实测通过,精确报错 |
| Lesson | `0020-zod-promote-shared-schema.md`(309 行) |
| LR | 本篇 |

## 撞到的 4 个 monorepo 基础设施问题

### 问题 1 · `libs/shared/` 不在 tsconfig include

**症状**:把 `base-env.ts` 放到 `libs/shared/config/`,5 个 service import 它:

```
TS2306: File '...libs/shared/config/base-env.ts' is not a module.
```

**根因**:`libs/shared/tsconfig.lib.json` 只 `include: ["src/**/*"]`,`config/` 在外面,**ts-jest + tsc 都看不到**。

### 问题 2 · tsconfig.app.json rootDir 限制

**症状**:把 base-env 移到 `libs/shared/src/config/`,测试通过。但 `pnpm start:*` 编译失败:

```
TS6059: File 'libs/shared/src/config/base-env.ts' is not under
'rootDir' '/Users/nmsn/Studio/nest-search/apps/search-service'.
'rootDir' is expected to contain all source files.
```

**根因**:每个 service 的 `tsconfig.app.json` 有 `"rootDir": "."`,意思是"我只编译我自己的目录"。

**修复尝试**:`rootDir: "../../"`(monorepo 根)→ 让 tsc 能找到 libs/shared。但下一个问题来了。

### 问题 3 · nest build 不复制 libs/shared 到 dist

**症状**:rootDir 放宽后 `pnpm test` 18 passed。但 `pnpm start:search` 跑 nest build 时:

```
Error: Cannot find module '../../../../libs/shared/src/config/base-env'
Require stack:
- /Users/nmsn/Studio/nest-search/dist/apps/search-service/src/config/env.schema.js
```

**根因**:`nest build` 每个 app 单独编译,只 emit `apps/<svc>/src/**` 到 `dist/apps/<svc>/`。**libs/shared 的编译产物在 `dist/libs/shared/`,但相对路径 `../../../../libs/shared/src/config/base-env` 解析的是 `dist/apps/search-service/src/config/../../../../libs/shared/src/config/base-env` —— 不存在**。

**这是 nest-search monorepo 的核心缺口**:**没有 build orchestration**。需要 Turbo / Nx / 或者 nest-cli 的 project references 来正确编排"先 build shared,再 build apps"。

### 问题 4 · tsconfig paths alias 在 runtime 不解析

**症状**:加 `"paths": { "@app/shared/*": ["libs/shared/src/*"] }` 到 root tsconfig。改 import 路径为 `@app/shared/config/base-env`。tsc 编译过(jest 也用 moduleNameMapper 加了),但 `pnpm start:*` 仍然 `Cannot find module '@app/shared/...'`。

**根因**:`paths` 是 TypeScript 编译时的概念,运行时 Node.js 不会自动解析。需要 `tsconfig-paths/register` 或者 `tsc-alias` 后处理。

## 4 次尝试 → 最终决定:inline

| # | 方案 | 结果 |
|---|---|---|
| 1 | 相对路径 + libs/shared/config | TS2306 include 问题 |
| 2 | 相对路径 + libs/shared/src/config | TS6059 rootDir 问题 |
| 3 | rootDir 放宽到 `../../` | dist runtime Cannot find module |
| 4 | tsconfig paths alias | runtime 仍 Cannot find module(需要 tsconfig-paths) |
| **5** | **inline 公共字段,删 libs/shared 文件** | **✅ 测试 + fail-fast + nest start 全过** |

## 这个决定对不对?

**对(在当前 nest-search 状态下)**。

理由:
- nest-search 没装 Turbo / Nx / nest-cli project refs(检查 nest-cli.json,projects 都用同 rootDir)
- 装 build orchestration 是另一个大工程,超出 0020 scope
- inline 公共字段 = 7 行 × 5 service = 35 行重复,**成本可接受**
- 每个 schema 顶部加注释指向其他 4 个 service,提醒保持同步

**lesson 应记的硬道理**:

> **monorepo 跨包共享 ≠ 文件共享**。需要 build orchestration(Turbo / Nx / nest-cli project refs)才能在 runtime 解析。
>
> 单元数小(7 个公共字段)时,**inline + 注释提醒**比**抽公共 + 跨包配置**更简单。
>
> 等公共字段长到 20+ 个 / 改 1 个字段要动 5+ 个文件时,**再装 Turbo + 抽公共**(那时候 ROI 才高)。

## nest-search 当前全景(0020 后)

```
gateway        ✅ pino + Zod (NEW 0020)
auth-service   ✅ pino + Zod (0019 + 0020 inline refactor)
search-service ✅ pino + Zod (NEW 0020)
sync-service   ✅ pino + Zod (NEW 0020)
form-service   ✅ pino + Zod (NEW 0020)
```

**5/5 服务 Zod 校验 ✓**

## Lesson 设计的反思

### 反思 1 · Lesson 写了"建议方案 A/B"但**没标 0020 monorepo 现状下 A 不可行**

0020 lesson §3 给了"抽 base-env"方案 A/B,user 没标"当前 monorepo 不能 cross-package import"。

**Lesson 改进方向**:每次给方案前,**先验证方案在当前项目状态下能跑**(不只是理论上正确)。0021 lesson 应该加一节"monorepo 现状约束"。

### 反思 2 · Claude 接管写代码暴露了 monorepo 隐性知识

LR-0023 写"user 写代码,Claude review"。这次 user 让 Claude 写,**暴露了 Claude 对 monorepo 隐性知识的不完整**:
- 我知道 `libs/shared/` 是"代码共享"位置
- 但**我不知道** nest-search 没有 build orchestration
- **没先验证**"libs/shared/ 能不能跨包被 apps/*/src import 进来跑通",直接动手写,导致返工

**改进方向**:Claude 写跨包代码前,**必须**先 `pnpm build` 或 `pnpm start:*` 验证基础链路通。

### 反思 3 · "inline vs 共享"是 lesson 应教的判断

LR-0020 提到"WET 原则",但 lesson 没展开。这次撞了正好是 WET 的教科书案例。

**Lesson 改进方向**:0021 / 后续 lesson 加一节"什么时候该抽共享,什么时候该 inline"决策树:
- 公共 < 20 个字段 → inline + 注释
- 公共 ≥ 20 个字段 + 改 1 个要动 5+ → 抽 + 装 build orchestration

## 给 0021 的输入

0021 原计划 = env.example + ConfigService 改造 + 总验证。

**调整**:因为 0020 没真正抽共享,**0021 调整**为:
- **§1**:写 `.env.example`(5 个 service 各一个,文档化所有 env 字段)
- **§2**:写 `docs/CONFIG.md`(统一说明每个 env 字段的用途 + 默认值)
- **§3**:删除/收敛 `process.env` 直接引用(为 ConfigService 改造做准备)
- **§4**:跑总验证(5 service 都能 fail-fast)

**ConfigService 全面替代 process.env 留给后续 lesson**(单独成节)。

## 下一节预告

**0021 = env.example + 配置文档化**(原计划的 ConfigService 改造延后)。

为什么延后:ConfigService 改造 scope 太大(动 main.ts + 所有 service 构造器 + 所有 controller),单独成节比塞进 0021 更合理。

---

**说干就开 0021 — 默认:5 个 service 各自 .env.example + docs/CONFIG.md 文档化**。
