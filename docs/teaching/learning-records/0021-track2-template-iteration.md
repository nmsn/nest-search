# 0021 — 副线 2 第 2 课:0017 + lesson 模板迭代

> 0017 是副线 2 第 2 课,把 pino 复制到 sync + form。这一篇记录 lesson 模板的迭代过程(从"复制即学"到"实操验证")。

## 0017 实际产出

| 项 | 内容 |
|---|---|
| Commit | (next) `feat(sync+form-service): migrate pino structured logging (0017)` |
| 文件 | 3 个: `apps/sync-service/src/app.module.ts`、`apps/form-service/src/app.module.ts`、`0017-sync-form-pino-migration.html` |
| 代码改动 | 每个服务 10 行 × 2 = **20 行新增**,0 业务逻辑改动 |
| 测试影响 | 0 测试添加,0 测试 break |
| 实操验证 | sync-service port 3001 起来 ✓ + form-service port 3003 起来 ✓ |
| Lesson | 350 行 HTML,**新模板**(实操步骤 + 故意改坏验证 + quiz 不加粗) |

## lesson 模板迭代 — 0016 vs 0017

| 维度 | 0016(旧模板) | 0017(新模板) |
|---|---|---|
| 代码动手 | 改 1 个文件 | 改 2 个文件(同样的 10 行 × 2) |
| **实操动手** | **几乎 0**(只让你跑 pnpm test) | **4 个实操步骤**(lsof / 起服务 / 看 log / 杀进程) |
| **故意改坏** | 无 | **§4.1 删 genReqId 看后果**(反向验证) |
| **进程清理** | 没强调 | **§2.2 / §3.2 显式教 lsof 兜底** |
| Quiz 加粗 | 已修 | **从源头不加粗**(新习惯) |

**核心变化**:0017 把"动手"重新定义为**操作动手**(运行命令 + 观察结果),不只是"敲代码"。

## 撞到的 3 个真实坑(0017)

### 坑 1 · `pnpm start:sync` 的进程残留

**症状**:第一次跑 `pnpm start:sync &`,然后 `kill $PID`,但**端口 3001 还被占**。

**根因**:sync-service <code>main.ts</code> 同时起 HTTP + BullMQ consumer。`nest start` 是父进程,`kill $PID` 只杀父进程,nest CLI 起的子进程(node + amqp 连接)没被波及。

**修复模式**:
```bash
# 单层 kill 不够,加 lsof 兜底
kill $(cat /tmp/sync.pid) 2>/dev/null
lsof -ti :3001 -P | xargs kill -9 2>/dev/null
```

**Lesson 设计含义**:§2.2 / §3.2 必须把"lsof 兜底"写进操作步骤,不能假设 `kill $PID` 就完事。

### 坑 2 · 故意删 genReqId 的"破坏性测试"

**坑的反面**:学员读完 §2-3 可能觉得"pino 配置就是抄过来,删一行应该没事"。**实际上删了就跨服务追踪断**。

**为什么这个反向验证价值高**:

| 验证类型 | 价值 |
|---|---|
| **正向验证**(能起 + 测试过) | 证明"装好了" |
| **反向验证**(故意改坏看后果) | 证明"配置有意义,不是装饰品" |

**Lesson 设计含义**:0018 起的 lesson,**每个"配置项"都应该有"故意改坏看后果"** 的反向验证章节。否则学员永远分不清"必要配置 vs 可选配置"。

### 坑 3 · Lesson 模板复用前要先验证

**症状**:0016 lesson 写完时,代码照搬没跑通(后续 0014 才补的 `tsconfig.spec.json` / supertest 7.x import 等都是事后补)。

**0017 改进**:**先在本地跑 sync + form 起来 + 看 log → 再写 lesson**。

**Lesson 设计铁律**(从 LR-0020 升级):

> **Lesson 写代码章节时:**
> 1. 改代码
> 2. **本地真跑**(起服务 / curl / 看 log)
> 3. **故意改坏验证**(理解每个配置的作用)
> 4. 把"真输出"贴进 lesson HTML
> 5. commit

**0017 严格走完了 1-5**,所以 lesson §2.2 / §3.2 / §4.1 是真操作过的内容,不是设计文档。

## nest-search 当前状态(0017 后)

```
gateway        ✅ pino  + Swagger + Roles + Throttler + ProxyModule
auth-service   ✅ pino  + Redis + Drizzle
search-service ✅ pino  ← 0016
sync-service   ✅ pino  ← 0017 NEW
form-service   ✅ pino  ← 0017 NEW
```

**5/5 服务对齐 pino** —— 副线 2 的"模式迁移"目标达成。

## 0018 预告 · 副线 2 收官

按 LR-0019 的全节奏:

| 课 | 主题 | 状态 |
|---|---|---|
| 0016 | search 加 pino | ✅ |
| 0017 | sync + form 加 pino | ✅ |
| **0018** | **副线 2 收官 · 跨服务追踪实测** | **下节** |

**0018 内容预想**:
- §1: 跨服务追踪实测 — gateway → search 一次请求,看 2 个服务 log 都有同一个 x-request-id
- §2: 收官清单 — nest-search 当前全景图(所有服务 / 所有 module / 所有测试)
- §3: 副线 2 总结 — 4 个反模式 + 4 条 lesson 铁律
- §4: 副线 3 预告(候选:CI 集成 / Docker 部署 / 配置管理)
- §5: Quiz + commit

预计 30-45 分钟,纯实操 + 文档。

## 给自己的反思

### 反思 1 · "复制粘贴" lesson 的隐藏价值

0017 表面"无聊"(10 行 × 2 复制),但 §4.1 的反向验证是**最有教育意义的部分**——学员亲手看到"删一行就断追踪"。

**Lesson 设计含义**:**无聊的章节 ≠ 无内容的章节**。"复制粘贴" + "故意改坏" 组合,比"写新功能"更有 learning value,因为**学员必须理解每一行的存在意义**。

### 反思 2 · 实操步骤的颗粒度

0017 §2.2 的实操步骤分 5 步(lsof / 起服务 / 看 log / curl / 杀进程)。**这 5 步是真实操作时遇到的 5 个断点**——少一步学员就会卡。

**经验法则**:每个实操章节的步骤数 = **真实操作时会被卡住的次数 + 1**(最后一步"做完了")。

### 反思 3 · 进程清理模式值得抽出来

0017 用 `lsof -ti :PORT -P | xargs kill -9` 这个模式,后面 0018 + 后续 lesson 都会反复用到。

**考虑**:是不是该在仓库根写个 `scripts/kill-port.sh`,以后所有 lesson 引用它?

(暂缓,等下次重复 3 次再抽 —— WET 原则)

## 下一节预告

**0018 = 副线 2 收官 · 跨服务追踪实测**:
- 实操一次完整链路(gateway → search),看同一个 x-request-id 出现在 2 个服务 log
- 写 LR-0022(副线 2 收官)
- 选副线 3 方向

---

**说干就开 0018 — 默认:跨服务追踪实测 + nest-search 全景图 + 副线 2 反模式总结。**
