# 0061 · API 版本控制 + 灰度发布

> Phase D 第 7 课（收官）。nest-search 当前是单一 API，**生产环境**需要版本控制和灰度发布能力。

## 你今天会拿到什么

1. 理解 **API 版本控制的必要性**
2. 掌握 **3 种版本策略**（URI / Header / Query）
3. 理解 **灰度发布**（Canary）
4. nest-search 改造点（演示）
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
当前: 单版本 API
  GET /api/search/ds/products
  POST /api/auth/login
  POST /api/sync/full/ds

问题:
  ❌ 改 API 后老客户端崩溃
  ❌ 不能同时跑 v1 和 v2
  ❌ 不能灰度新版本
```

### 1.2 真实生产场景

```
场景: 改 /api/products 返回结构
  旧: { id, name, price }
  新: { id, name, price, imageUrl, categoryId }

直接改:
  ❌ 老 APP 还在用旧字段 → 崩
  ❌ 业务方没准备好 → 数据对接失败

解决: API 版本控制
  - /api/v1/products (老版本, 继续维护)
  - /api/v2/products (新版本, 推荐用)
  - 客户端按需选择
```

---

## §2. 3 种版本策略

### 2.1 策略 A: URI 版本（最常用）

```
URL 形式:
  https://api.example.com/v1/products
  https://api.example.com/v2/products

nest-search:
  /api/v1/search/ds/products
  /api/v2/search/ds/products
```

**优点**：
- ✅ 直观 (URL 一眼看出版本)
- ✅ 简单 (路由前缀就行)
- ✅ 浏览器可缓存
- ✅ 容易实现

**缺点**：
- ❌ URL 长
- ❌ 不优雅

### 2.2 策略 B: Header 版本

```
请求:
  GET /api/search/ds/products
  Headers:
    Accept: application/vnd.nest-search.v2+json

  或:
  GET /api/search/ds/products
  Headers:
    X-API-Version: 2
```

**优点**：
- ✅ URL 简洁
- ✅ 同一 URL 不同版本

**缺点**：
- ❌ 不直观 (要看 header)
- ❌ 浏览器调试不友好

### 2.3 策略 C: Query 参数

```
请求:
  GET /api/search/ds/products?api-version=2
```

**优点**：
- ✅ URL 一目了然

**缺点**：
- ❌ Query 是业务参数, 跟 API 版本混一起
- ❌ 不推荐 (不专业)
```

### 2.4 选哪个？

| 策略 | 适合 | 大厂用 |
|------|------|--------|
| **URI** | 99% 场景 | ✅ Stripe / GitHub / Twilio |
| **Header** | 内部 API, 频繁切换 | ✅ Google / Microsoft |
| **Query** | 不推荐 | ❌ |

**nest-search 推荐**：URI 版本（最直观 + 简单）。

---

## §3. NestJS URI 版本实现

### 3.1 改造结构

```
当前:
  /api/search/ds/products

改造:
  /api/v1/search/ds/products
  /api/v2/search/ds/products
```

### 3.2 两种实现方式

#### 方式 1: 路由前缀（推荐）

```ts
// app.module.ts
@Controller({ path: 'api', version: VERSION_NEUTRAL })  // 不带版本
export class AppController {}

// v1
@Controller({ path: 'search', version: '1' })
export class SearchV1Controller {}

// v2
@Controller({ path: 'search', version: '2' })
export class SearchV2Controller {}

// 路由:
  GET /api/v1/search/ds/products  → SearchV1Controller
  GET /api/v2/search/ds/products  → SearchV2Controller
```

**NestJS 原生支持**：`@Controller({ version: '1' })` 自动生成 `/v1/...` 路由。

#### 方式 2: URI 手动

```ts
@Controller('api/v1/search')
export class SearchV1Controller {}

@Controller('api/v2/search')
export class SearchV2Controller {}
```

简单但不够优雅。

### 3.3 VERSION_NEUTRAL

```ts
// 登录等不需要版本的端点
@Controller({ path: 'auth', version: VERSION_NEUTRAL })
export class AuthController {}

// 路由:
  POST /api/auth/login  (不带版本)
```

---

## §4. 灰度发布（Canary）

### 4.1 是什么

```
灰度 = 新版本先给 1% 用户, 没出问题再扩到 100%

时序:
  1. 部署 v1 (100% 用户用)
  2. 部署 v2 (5% 用户用, 95% 还在 v1)
  3. 观察 v2 没问题
  4. 扩到 50%
  5. 没问题, 扩到 100%
  6. 下线 v1

类比:
  - 新功能像新药
  - 先给 5% 病人试
  - 没问题再推广
```

### 4.2 灰度方式

| 方式 | 怎么分 | 适合 |
|------|--------|------|
| 按比例 | 1% / 5% / 50% 流量 | 新功能 |
| 按用户 | VIP 优先, 普通用户后 | 关键改动 |
| 按地区 | 北京先, 上海后 | 性能测试 |
| 按 header | X-Beta-User: true | 内测 |

### 4.3 灰度 vs 蓝绿

```
蓝绿部署:
  - 两套环境 (蓝 / 绿)
  - 切换流量 (蓝 → 绿)
  - 切换瞬时 (1 秒)
  - 适合: 完整版本切换

灰度:
  - 一套环境, 多版本
  - 流量按比例分
  - 渐进 (小时 / 天)
  - 适合: 新功能验证
```

### 4.4 nest-search 怎么实现

```
场景: 新加 /api/v2/search 用 ES 8.x 特性
  → 5% 用户先体验
  → 没问题扩到 100%

实现 (网关层):
  - gateway 根据 userId 哈希分流
  - 5% 路由到 v2, 95% 路由到 v1
  - 失败率 < 1% 自动回滚到 v1
```

---

## §5. 实战 demo

### 5.1 改造目标

```
当前:
  GET /api/search/ds/products

目标:
  GET /api/v1/search/ds/products (老版本, 保留)
  GET /api/v2/search/ds/products (新版本, 推荐)
```

### 5.2 search-service 改造

```ts
// search-v1.controller.ts
@Controller({ path: 'search/:businessLine', version: '1' })
export class SearchV1Controller {
  @Get('products')
  list() { /* 老逻辑 */ }
}

// search-v2.controller.ts
@Controller({ path: 'search/:businessLine', version: '2' })
export class SearchV2Controller {
  @Get('products')
  list() { /* 新逻辑, 加了 highlight 等 */ }
}
```

### 5.3 gateway 配置

```yaml
# gateway 路由
/api/v1/* → search-service-v1
/api/v2/* → search-service-v2
```

### 5.4 客户端选择

```typescript
// 老客户端: 不变, 继续用 v1
fetch('/api/v1/search/ds/products')

// 新客户端: 用 v2, 享受 highlight + suggest
fetch('/api/v2/search/ds/products')
```

---

## §6. 版本生命周期

```
v1: 老版本
  - 持续维护 (bug 修复)
  - 不加新功能
  - 半年后下线

v2: 当前推荐
  - 持续加新功能
  - 主版本

v3: 计划中
  - 等 v2 稳定后开始
```

**Google API 版本策略**：
- v1 老: 长期支持
- v2 当前: 主推
- v3 beta: 灰度
- 每年最多 1-2 个大版本

---

## §7. nest-search 决策

```
要不要现在加 API 版本?

✅ 适合加 (推荐):
  - 1-2 小时工作
  - 简历亮点 ("API 版本控制 + 灰度")
  - 未来扩展更灵活

⚠️ 但:
  - nest-search 是教学项目
  - 现阶段没多版本需求
  - 做了没真实场景测试
```

**建议**：
- 加 URI 版本号（最小 demo，1 小时）
- 灰度发布**只讲概念**（不在 nest-search 实现）
- 未来加新功能时, 旧版本独立维护

---

## §8. Quiz

**Q1: API 版本策略哪个最常用？**

A) Header 版本
B) URI 版本
C) Query 参数

**Q2: 灰度发布是什么？**

A) 立即全量切换
B) 先给部分用户用, 验证后再扩
C) 测试环境先跑

**Q3: nest-search 加 API 版本的价值？**

A) 必须加（生产必备）
B) 现阶段价值低, 但学了概念对未来有用
C) 永远不需要

---

## §9. Commit Message

```
feat(search-service): 0061 API 版本控制 (URI 策略)

- search.controller.ts 加 @Controller({ version: '1' })
- 新增 search-v2.controller.ts (演示新功能)
- 路由自动生成 /api/v1/... /api/v2/...
- 21 测试还过
- 灰度发布: 概念讲解, nest-search 不实现
```

---

## §10. 跨节链接

- [0060 · DI scope](./0060-di-scope-advanced.md) — 上一课
- [0062 · 外键禁用 + 业务一致性](./0062-no-fk-business-consistency.md) — 下一课（Phase E 开始）
- [search.controller.ts](../../apps/search-service/src/search/search.controller.ts) — 当前 controller
