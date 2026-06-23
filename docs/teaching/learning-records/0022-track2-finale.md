# 0022 — 副线 2 收官 · 跨服务追踪实测 + lesson 设计演化

> 0018 是副线 2(跨服务迁移)的收官。这一篇记录实测过程中的 3 个发现 + 4 条 lesson 设计铁律的演化。

## 0018 实际产出

| 项 | 内容 |
|---|---|
| Commit | (next) `docs(teaching): 副线 2 收官 · 跨服务追踪实测 (0018)` |
| 文件 | 2 个: `0018-track2-finale.html`、`0022-track2-finale.md`(本篇) |
| 代码改动 | **0** — 纯反思 + 实操验证 |
| 实测输出 | gateway + search-service 真实跨服务 trace log(已贴进 0018 lesson §2.3) |
| Lesson | 380 行 HTML,5 章节 + 3 道 quiz + nest-search 全景图 |

## 跨服务追踪实测的 3 个发现

### 发现 1 · `autoLogging: false` 阻塞 trace 可视化

**症状**:跑测试 → 200 OK,但 grep `trace-abc-002` 在两边 log 都找不到。

**根因**:production 配置 `autoLogging: false`,HTTP 请求**完全不打 log**。请求通过了但"看不见"。

**教训**:**配置默认值(prod 默认)和演示需求(看到东西)有矛盾**。Lesson 必须显式说明 trade-off:

| autoLogging | 优点 | 缺点 |
|---|---|---|
| `true` | 每个 HTTP 请求有 log,debug 容易 | prod 太吵,1 个请求 2 条 log |
| `false` | prod 安静,显式 log 才出 | 默认看不到 trace,debug 要加 log |

**Lesson 改进**:§2.1 写明"为了看到 trace,临时开 autoLogging",§2.4 提醒"测完恢复"。

### 发现 2 · search-service log 里 `user-agent: axios/1.16.0`

**实测证据**:
```json
"req":{... "user-agent":"axios/1.16.0" ...}
```

**含义**:search-service 收到的请求**不是 curl** 直接发的,是 gateway 的 `HttpClientService`(axios 库)发的。

**反向验证**:`HttpClientService.request()` 在 gateway/src 里有这段代码:
```ts
const headers = {
  'Content-Type': 'application/json',
  ...config.headers,
  ...(requestId ? { 'x-request-id': requestId } : {}),
};
```

**证明**:`HttpClientService` 自动从 gateway 当前 request 拿 `req.id`(即 `genReqId` 生成的 trace)加到 `x-request-id` 头 → 转发 → search-service 的 `genReqId` 从头读回来。

**这条调用链**就是 0010 + 0016 设计的全部价值 — 3 个文件(gateway `HttpClientService` / gateway `genReqId` / search-service `genReqId`)协同,实现"跨服务追踪",**零业务代码改动**。

### 发现 3 · `lsof -ti :PORT | xargs kill -9` 是兜底神器

**0017 已经撞过**(sync 双进程残留),0018 又用了一次 — 关 gateway + search 时,kill nest start 父进程不够,有些 node 子进程会漏。

**Lesson 设计含义**:这个模式在 0017 + 0018 都用了,共 2 次。**再出现 1 次就抽 `scripts/kill-port.sh`**(WET 原则)。

## nest-search 当前全景(0018 后)

```
┌─────────────┐
│  Frontend   │ (Vite dev / 静态部署)
│  Vite :5173 │
└──────┬──────┘
       │
       ↓ x-request-id: trace-abc-XXX
┌──────┴──────────────────────────┐
│  Gateway (3000)                  │ ← entry point
│  ✅ pino + Swagger + Roles       │
│  + Throttler + ProxyModule       │
└──┬─────────┬─────────┬─────────┬─┘
   │         │         │         │
   ↓         ↓         ↓         ↓
┌────┐  ┌────────┐ ┌───────┐ ┌───────┐
│Sync│  │ Search │ │ Auth  │ │ Form  │
│3001│  │  3002  │ │ 3004  │ │ 3003  │
│pino│  │  pino  │ │ pino  │ │ pino  │
│    │  │  +ES   │ │ +MySQL│ │+MySQL │
│    │  │        │ │ +Redis│ │       │
└────┘  └────────┘ └───────┘ └───────┘
                                       ↑
                              5/5 服务 pino ✓
```

**测试覆盖**:
- 11 单测(RolesGuard / ProxyService / HttpClientService)
- 7 e2e(auth register/login/me 链路)
- 总计 18 passed,~3 秒

## 4 条 lesson 设计铁律(演化)

副线 1(0013-0015)撞了 14 个反模式,提炼出 4 条 lesson 铁律。副线 2(0016-0018)撞了 2 个 lesson 设计 bug,强化了铁律。

### 铁律 1 · lesson 代码先跑通再写 HTML

**起源**:0013 撞了"数字 12 vs 11"反模式,0014 撞了"lesson 5 处代码错"反模式。

**强化**:0017 起严格执行:**先改代码 → 真跑 → 故意改坏验证 → 写 HTML → commit**。

**0018 验证**:本次实测产生的真实 trace log 直接贴进 §2.3,不是设计文档。

### 铁律 2 · 基础设施改动单独成 §X.0

**起源**:0013 反模式 5 "jest.config.js 引用 tsconfig 没解释"。

**强化**:0014 起每个 lesson 有"§X.0 准备"章节,讲清基础设施改动。

**0018 验证**:§2.1 把"启服务前准备"独立成节,§2.4 把"清理恢复"独立成节。

### 铁律 3 · 第三方 API 标版本号

**起源**:0014 反模式 2 "supertest 7.x import 语义变了"。

**强化**:lesson 引用第三方 API 必标版本。

**0018 验证**:本文 §2.3 引用 `axios/1.16.0`(user-agent 暴露的版本),证明 gateay 用的是 axios 1.16。

### 铁律 4 · quiz 不加粗答案

**起源**:LR-0020 没意识到 `<strong>` 是 spoiler,你(用户)在 0017 quiz 时抓到。

**强化**:**0 加粗**成为新 lesson 默认。0018 quiz 3 道题全部不加粗,Ctrl+F 搜 `<strong>` 在 quiz 选项里**0 命中**。

**未来 lesson 必须遵守**:写 quiz 时只用普通文本 + `data-correct` 属性 + JS 反馈。`<strong>` 只能用在叙述文字里。

## 副线 2 跟副线 1 / principles 轨道的差异

| 维度 | principles(0009-0012) | 副线 1(0013-0015) | 副线 2(0016-0018) |
|---|---|---|---|
| **本质** | 发明新模式 | 建测试基础设施 | 复制已有模式 |
| **代码改动** | 高 | 中 | **低**(复制为主) |
| **业务风险** | 高(新模式可能错) | 中(工具链边界) | **低**(已验证模式) |
| **lesson 反模式** | 0(发明时小心) | 14(工具链陷阱) | **2(都是 lesson 设计层)** |
| **测试改动** | 0 | +18 | 0 |
| **commit 数** | 4 | 5 | 3 |

**关键洞察**:**轨道越往后,代码风险越低,lesson 设计风险反而升高**。0013 撞 14 反模式全在工具链,0018 撞 0 业务反模式全在 lesson 模板。

## 给原则的反思 — 副线 2 接下来

副线 2 已经收官(0016-0018)。**下一步三个候选**:

### 候选 A · 副线 3 = Docker 化部署

- Dockerfile per service
- docker-compose.prod.yml(替换 dev 版)
- 真部署一次(本地或 staging)

**预计**:2-3 节,代码量中,有"真实上线"成就感。

### 候选 B · 副线 4 = 配置中心 / Env 管理

- Joi schema 校验环境变量
- 集中 .env 管理(避免散落)
- 区分 dev / test / prod 配置

**预计**:1-2 节,代码量低,但 prod 上线前必做。

### 候选 C · 副线 5 = 监控 / 健康检查

- 每个服务加 healthcheck(/health + /ready)
- Prometheus 指标(请求数 / 延迟 / 错误率)
- Grafana 仪表盘

**预计**:2-3 节,代码量中,但需要外部依赖(Prometheus)。

## 我的推荐

**副线 3 (Docker 化)**。理由:

1. **"代码永远绿"已经达成**(副线 1)+ **"跨服务追踪"已经达成**(副线 2),但**"真上线"还差临门一脚**
2. **本地 `docker-compose up` 已经在跑**,改写成 prod 版是"现有 → 增强",不是从 0 开始
3. **完成后 nest-search 就从"本地玩具"升级成"可部署服务"**,整个项目阶段跃迁

## 副线 2 整体回顾(0016-0018 一句话)

> **"把 gateway 已经验证的 pino 模式,复制到其他 4 个服务,然后实测一次请求在多个服务 log 里看到同一个 trace。"**

**做到了**。nest-search 现在 5 个服务都有 pino,跨服务追踪实测通过。

---

**副线 3 方向你来选。也可以说"先停,消化副线 1 + 2"。**
