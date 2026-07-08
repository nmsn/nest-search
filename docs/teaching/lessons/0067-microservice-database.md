# 0067 · 微服务 Database per Service

> Phase E 收官课。nest-search 5 service 中,**form-service / sync-service 仍共享 nest_search DB**(反模式)。本节演示:
> 1. Database per Service 核心原则
> 2. 5 种跨服务数据访问模式
> 3. nest-search form/sync 拆独立 DB 实战
> 4. Phase E 6 节收官总结

## 你今天会拿到什么

1. 理解 **Database per Service 原则**(Chris Richardson)
2. 掌握 **5 种跨服务数据访问模式**
3. nest-search 拆 DB 实战(form → nest_search_form,sync → nest_search_sync)
4. **Phase E 6 节完整收官**
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状(反模式盘点)

```
apps/auth-service  → DB: nest_search(独占)         ✅
apps/form-service  → DB: nest_search(共享!)        ❌
apps/sync-service  → DB: nest_search(共享!)        ❌
apps/search-service → ES + 部分共享 DB             ⚠️
apps/gateway       → 无 DB                          ✅
```

**两个反模式**:
1. **form-service** 用了 `casTickets` 表(cross-service 访问!)
2. **sync-service** 通过 schema-factory 动态生成表,本质共享 DB 池

### 1.2 真实生产场景

```
form-service 改 users 表加字段:
  ❌ 影响 auth-service(同 DB!)
  ❌ 部署要协调
  ❌ 故障连带(form 挂 → auth 受影响)

正确做法:
  ✅ form-service 改 form DB,不影响 auth
  ✅ 独立部署
  ✅ 故障隔离
```

### 1.3 nest-search 真要拆吗?

> **真没必要**(教学项目,共享 DB 反而省事)。
> 但 **理解 DB per Service + 会拆** 是企业级后端工程师必备。

**本节演示**:form/sync 各拆一个 DB,跨 service 数据走 API Composition。

---

## §2. Database per Service 核心原则

### 2.1 Chris Richardson 原文

> "Each microservice must own its database. No other service is allowed to access the database directly."
>
> —— microservices.io

### 2.2 4 个理由

| 理由 | 解释 |
|---|---|
| **独立部署** | service A 改 schema 不影响 B |
| **技术异构** | A 用 PG,B 用 MongoDB / ES / Redis |
| **故障隔离** | A 的 DB 挂了不影响 B |
| **独立伸缩** | DB 单独扩缩容 |

### 2.3 nest-search 之前为何共享?

```
教学项目初期:
  - 1 个 PG 容器
  - 5 个 service 各自建表(schema 隔离)
  - 方便调试(看一张图懂全貌)

问题暴露后:
  - form 写 casTickets(应该走 auth API,不是直连)
  - sync 用 schema-factory 跨 service 访问
  - 共享 = 隐性耦合
```

---

## §3. 5 种跨服务数据访问模式

### 3.1 API Composition(最常用,80%)

```
form-service 要 user 信息?
  → 不直连 auth DB
  → 调 auth-service HTTP API:GET /api/users/:id
  → 拿到数据用
```

**优点**:简单、解耦、实时
**缺点**:同步调用、链路长

### 3.2 CQRS(读视图,异步聚合)

```
search-service 要展示 user + 订单?
  → 不调任何 service
  → 自己的 ES 里有"读视图"(user + 订单聚合)
  → ES 里的数据由 events 异步更新
```

**优点**:查询快、链路短
**缺点**:最终一致、有延迟

### 3.3 Event Sourcing(事件流回放)

```
所有变更 = 事件流
  user.created → order.placed → order.paid
要查"用户当前状态"?
  → replay 所有事件
  → 推到当前状态
```

**优点**:审计友好、可回放
**缺点**:复杂、状态重建慢

### 3.4 Saga(跨服务事务)

```
订单服务:创建订单 → 库存服务:扣库存 → 支付服务:收款
任一失败 → 反向补偿(取消订单 / 退库存 / 退款)
```

**适用**:复杂长事务
nest-search 不用(规模小)

### 3.5 Shared Database(❌ 反模式)

```
多 service 直连同一个 DB
  → 部署耦合
  → 故障连带
  → 隐性依赖
```

**nest-search 当前的问题就是这个**。

### 3.6 对比

| 模式 | 一致性 | 实时性 | 复杂度 | nest-search |
|---|---|---|---|---|
| **API Composition** | 强 | 实时 | 低 | ✅ 主用 |
| **CQRS** | 最终 | 秒级 | 中 | search-service 用 |
| **Event Sourcing** | 强 | 实时 | 高 | 未来用 |
| **Saga** | 最终 | 实时 | 中 | 未来用 |
| **Shared DB** | — | — | — | ❌ 反模式 |

---

## §4. nest-search 实战

### 4.1 改造路径

```
最小 (1 小时):
  1. docker-compose.yml 加 nest_search_form + nest_search_sync
  2. form-service 切 DB URL
  3. sync-service 切 DB URL
  4. 移除共享访问(form 不再直连 casTickets)
  5. 21 测试还过

完整 (2-3 小时):
  1. 上面
  2. 跨 service 数据走 API Composition(form 通过 HTTP 调 auth)
  3. 同步走 Outbox(form 写自己的 outbox → auth consumer 处理)
```

### 4.2 docker-compose.yml 改造

```yaml
# 之前
services:
  postgres:
    environment:
      POSTGRES_DB: nest_search

# 之后(1 个 PG 实例 + 3 个 DB)
services:
  postgres:
    environment:
      POSTGRES_DB: postgres  # 初始 DB
    # 进入后 CREATE DATABASE nest_search / nest_search_form / nest_search_sync
```

### 4.3 .env 改造

```bash
# auth-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nest_search

# form-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nest_search_form

# sync-service
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nest_search_sync
```

### 4.4 form-service 改造(关键!)

```ts
// form.service.ts — 之前(❌ 直连 auth DB 的 casTickets)
async getFormWithOwner(formId: number) {
  const form = await this.db.select().from(forms).where(eq(forms.id, formId));
  const [owner] = await this.db.select().from(casTickets)  // ❌ 跨 service!
    .where(eq(casTickets.id, form.ownerId));
  return { form, owner };
}

// form.service.ts — 之后(✅ 调 auth API)
async getFormWithOwner(formId: number) {
  const form = await this.db.select().from(forms).where(eq(forms.id, formId));
  // 通过 HTTP 调 auth-service,不直连 DB
  const owner = await this.authApiClient.getUser(form.ownerId);
  return { form, owner };
}
```

### 4.5 sync-service 改造

```ts
// sync.service.ts — 之前(❌ schema-factory 跨 service)
async syncUser(userId: number) {
  // sync 写 auth 的表 = 反模式
  await this.dynamicDb.insert(users).values({...});
}

// sync.service.ts — 之后(✅ 调 API + 自己存副本)
async syncUser(userId: number) {
  // 1. 调 auth API 拿数据
  const user = await this.authApiClient.getUser(userId);

  // 2. 存自己的副本(只读视图)
  await this.db.insert(syncUserCache).values({
    sourceId: user.id,        // auth 的 id
    username: user.username,
    syncedAt: new Date(),
  });
}
```

### 4.6 跨 service 数据流向

```
                ┌─────────────────┐
                │  auth-service   │
                │  DB: nest_search│
                └────────┬────────┘
                         │ HTTP API(GET /api/users/:id)
                         ↓
┌─────────────────┐  ┌─────────────────┐
│  form-service   │  │  sync-service   │
│  DB: nest_search│  │  DB: nest_search│
│      _form      │  │      _sync      │
└─────────────────┘  └─────────────────┘
```

**单向**:`form / sync → auth`(读数据)
**反向**:写自己的 DB(不写别人的)

---

## §5. nest-search 完整架构图(改造后)

```
┌─────────────────────────────────────────────────────────┐
│                     gateway                              │
│  无 DB,只路由 + 鉴权转发                                  │
└────────────┬──────────────────────┬─────────────────────┘
             │                      │
       ┌─────↓──────┐         ┌────↓─────┐
       │ auth-service│         │search-svc │
       │  DB: nest_  │         │  ES + DB  │
       │   search    │         └───────────┘
       └─────┬───────┘
             │ HTTP API
       ┌─────┴───────────────┐
       │                     │
  ┌────↓─────┐         ┌────↓─────┐
  │form-svc  │         │sync-svc  │
  │DB:nest_  │         │DB:nest_  │
  │search_   │         │search_   │
  │form      │         │sync      │
  └──────────┘         └──────────┘
```

每个 service:
- ✅ 自己的 DB
- ✅ 通过 HTTP API 跨 service
- ✅ 故障隔离
- ✅ 独立部署

---

## §6. Phase E 6 节收官总结

| 课 | 主题 | 核心交付 |
|---|---|---|
| 0062 | 外键禁用 + 业务一致性 | 5 个理由 + 5 种替代方案 |
| 0063 | 高并发 + 连接池调优 | drizzle.service.ts 显式 pool |
| 0064 | 缓存策略 + CacheService | 通用 getOrSet + 3 大坑 |
| 0065 | 分库分表 + snowflake | Hash 路由 + 64 bit ID |
| 0066 | 分布式事务 Outbox | 同事务双写 + worker + 幂等 |
| **0067** | **微服务 DB per Service** | **拆 DB + API Composition** |

### Phase E 教学目标

✅ 理解企业级应用为什么禁外键
✅ 掌握连接池 / 索引 / 慢查询调优
✅ 理解缓存 3 大坑和通用封装
✅ 掌握分库分表 + snowflake 原理
✅ 理解分布式事务 4 种方案
✅ 掌握微服务 DB per Service 原则

### 累计实战能力(以简历为视角)

```
✅ "我设计过通用 CacheService,处理穿透/雪崩/击穿 3 大坑"
✅ "我配置过企业级 PG 连接池(max=20, statement_timeout=30s)"
✅ "我设计过 snowflake ID 生成器(64 bit BigInt,带时钟回拨保护)"
✅ "我用 Outbox 模式实现过分布式事务最终一致性"
✅ "我设计过 Database per Service 架构(form/sync 独立 DB)"
```

---

## §7. Quiz

**Q1: Database per Service 的核心原则?**

A) 多 service 共享一个 DB
B) 每个 service 独占自己的 DB
C) 不用 DB

**Q2: form-service 要 user 信息,正确做法是?**

A) 直连 auth DB
B) 调 auth-service HTTP API
C) 让用户自己去查

**Q3: Shared Database 是?**

A) 微服务推荐
B) 反模式
C) 性能最佳

---

## §8. Commit Message

```
feat(architecture): 0067 微服务 Database per Service(Phase E 收官)

- docker-compose.yml: 加 nest_search_form + nest_search_sync
- form-service: 切 DB URL + 移除直连 casTickets,改调 auth API
- sync-service: 切 DB URL + 移除 schema-factory 跨 service 写入
- 跨 service 数据走 API Composition(HTTP,不是直连 DB)
- 21 测试还过

Phase E 收官(0062-0067 全部完成):
  ✅ 0062 外键禁用
  ✅ 0063 连接池调优
  ✅ 0064 缓存策略
  ✅ 0065 分库分表
  ✅ 0066 分布式事务
  ✅ 0067 微服务 DB per Service
```

---

## §9. 跨节链接

- [0066 · 分布式事务 Outbox](./0066-outbox-pattern.md) — 上一课
- [CURRICULUM.md](../../CURRICULUM.md) — 回到课程总览
- [enterprise-database-architecture.md](../../reference/enterprise-database-architecture.md) — 完整参考
