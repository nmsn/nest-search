# 0039 · ES 性能特点 + 技术对比 + 企业级应用

> Phase B 第 10 课。0037-0038 讲了概念和语法,0039 收尾：**性能调优 + 技术选型对比 + 企业级使用模式**。

## 你今天会拿到什么

1. 理解 **ES 的性能特点**（优势和局限）
2. 掌握 **与 PostgreSQL FTS / MongoDB / Solr 的对比**
3. 了解 **企业级使用模式**（别名、分片策略、慢查询诊断）
4. 能做技术选型决策：什么场景用 ES,什么场景用 PG
5. 3 道 quiz

---

## §1. ES 的性能特点

### 优势

| 场景 | 性能 | 原因 |
|------|------|------|
| 全文搜索 | **10ms 级** | 倒排索引 O(1) lookup |
| 聚合分析 | **100ms 级** | 列式存储 + 预计算 |
| 高并发读 | **10K+ QPS** | 分片 + 副本水平扩展 |
| 模糊匹配 | **极快** | ngram / edge_ngram 分词 |

### 局限

| 场景 | 性能 | 原因 |
|------|------|------|
| 写入 | **中等** | 近实时(~1s 延迟),写入需要 refresh |
| 事务 | **不支持** | 无 ACID,无法回滚 |
| 频繁更新 | **差** | 每次更新 = 删除 + 重新索引 |
| 深分页 | **线性下降** | from=10000 时查询 10010 条 |
| 关系查询 | **不擅长** | 没有 JOIN,需要反范式化 |

### 关键性能指标

```
写入延迟: ~100ms (单条), bulk 批量更快
查询延迟: 1-50ms (简单查询), 100-500ms (复杂聚合)
近实时: refresh_interval 默认 1s
最大文档数: 受限于堆内存(每 shard 约 20 亿文档)
```

---

## §2. 技术栈对比

### 2.1 Elasticsearch vs PostgreSQL Full-Text Search

| 维度 | Elasticsearch | PostgreSQL FTS |
|------|--------------|----------------|
| 全文搜索性能 | ⭐⭐⭐⭐⭐ 10ms | ⭐⭐⭐ 100ms+ |
| 事务支持 | ❌ | ✅ ACID |
| JOIN 查询 | ❌ 不支持 | ✅ 原生支持 |
| 模糊搜索 | ✅ ngram | ❌ 需要 pg_trgm |
| 聚合分析 | ✅ 强大 | ⭐⭐⭐ 基础 |
| 运维复杂度 | ⭐⭐ 需要额外集群 | ⭐⭐⭐⭐ 已有 PG |
| 数据一致性 | 近实时 | 实时 |

**选型建议**：

```
✅ 用 ES: 全文搜索、日志分析、聚合报表、模糊搜索
✅ 用 PG: 事务性 CRUD、关系查询、数据一致性要求高
✅ 组合: PG 做主存储 + ES 做搜索层(nest-search 的架构)
```

### 2.2 Elasticsearch vs MongoDB

| 维度 | Elasticsearch | MongoDB |
|------|--------------|---------|
| 全文搜索 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 文档存储 | ⭐⭐⭐ 搜索优化 | ⭐⭐⭐⭐⭐ CRUD 优化 |
| 事务支持 | ❌ | ✅ (4.0+) |
| 索引类型 | 倒排 + 列式 | B-tree |
| 查询语言 | Query DSL | MQL |
| 聚合框架 | 强大(管道聚合) | 强大(聚合管道) |

**选型建议**：

```
✅ 用 ES: 搜索为主,日志分析
✅ 用 MongoDB: 文档 CRUD 为主,需要事务
```

### 2.3 Elasticsearch vs Solr

| 维度 | Elasticsearch | Solr |
|------|--------------|------|
| 分布式 | ✅ 原生 | ⭐⭐ 需要 SolrCloud |
| REST API | ✅ 原生 | ⭐⭐⭐ 支持 |
| 社区活跃度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 学习曲线 | 中等 | 较陡 |
| 适用场景 | 日志、搜索、分析 | 企业搜索 |

**结论**：2024 年后新项目几乎都选 ES,除非已有 Solr 遗产。

---

## §3. 企业级使用模式

### 3.1 索引别名 (Alias)

```json
// 不直接查询索引,而是通过别名
// 好处:无缝切换索引(重建索引时零停机)

// 创建别名
POST /_aliases
{
  "actions": [
    { "add": { "index": "products-ds-v2", "alias": "products-ds" } },
    { "remove": { "index": "products-ds-v1", "alias": "products-ds" } }
  ]
}
// 代码查询 "products-ds" 不需要改
```

**nest-search 可以改进的地方**：

```ts
// 当前:直接用硬编码索引名
const index = BUSINESS_LINES[businessLine].esIndex; // 'products-ds'

// 改进:用别名
const index = BUSINESS_LINES[businessLine].esAlias; // 'products-ds' (别名)
// 底层可以无缝切换 products-ds-v1 → products-ds-v2
```

### 3.2 分片策略

```
单节点开发: 1 主分片 + 0 副本
小规模生产: 1 主分片 + 1 副本 (nest-search 当前)
中规模:     3-5 主分片 + 1 副本
大规模:     主分片数 = 节点数 × 1.5

分片大小建议: 10-50 GB (太大查询慢,太小开销大)
```

### 3.3 慢查询诊断

```json
// 用 profile API 分析查询耗时
GET /products-ds/_search
{
  "profile": true,
  "query": {
    "match": { "name": "显示器" }
  }
}
// 返回每个 shard 的查询耗时分解
```

**常见慢查询原因**：

| 原因 | 解决方案 |
|------|---------|
| 深分页 | 用 search_after 替代 from/size |
| wildcard `*keyword*` | 改用 ngram 分词 |
| 大量聚合 | 减少 bucket 数量,用 composite |
| 字段未索引 | 检查 mapping 的 `index: false` |

### 3.4 写入优化

```json
// 批量写入用 bulk API
POST /_bulk
{"index": {"_index": "products-ds", "_id": "P001"}}
{"name": "55寸显示器", "price": 3999}
{"index": {"_index": "products-ds", "_id": "P002"}}
{"name": "32寸电视", "price": 1999}

// 批量大小建议: 5-15 MB / 批
// 太大: 内存压力,超时
// 太小: 网络开销占比高
```

```json
// 写入大量数据时临时关闭副本
PUT /products-ds/_settings
{
  "index": {
    "number_of_replicas": 0
  }
}
// 写完后恢复
PUT /products-ds/_settings
{
  "index": {
    "number_of_replicas": 1
  }
}
```

---

## §4. nest-search 架构分析

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ sync-service │────▶│  PostgreSQL  │────▶│ search-service  │
│ (RabbitMQ)   │     │  (主存储)     │     │ (Elasticsearch) │
└─────────────┘     └──────────────┘     └─────────────────┘
        │                                         ▲
        │           定时同步                       │
        └─────────────────────────────────────────┘
```

**数据流**：
1. sync-service 从 RabbitMQ 消费消息
2. 写入 PostgreSQL（主存储）
3. 定时同步到 Elasticsearch（搜索层）
4. search-service 查询 ES 返回结果

**这是企业级的标准模式**：PG 做事务性存储,ES 做搜索层,通过同步保持一致。

---

## §5. 技术选型决策树

```
需要全文搜索？
├── 否 → 用 PostgreSQL
└── 是
    ├── 数据量 < 100 万？
    │   └── 可以用 PostgreSQL FTS (简单场景)
    └── 数据量 > 100 万 或 需要复杂聚合？
        └── 用 Elasticsearch
            ├── 需要事务？→ PG 做主存储 + ES 做搜索层
            └── 不需要事务？→ ES 可以独立使用(日志场景)
```

---

## §6. Quiz

**Q1: ES 写入数据后多久可以搜索到？**

A) 立即
B) 约 1 秒 (近实时)
C) 约 1 分钟

**Q2: 什么场景应该用 PostgreSQL 而不是 ES？**

A) 全文搜索
B) 需要事务和数据一致性的 CRUD
C) 日志分析

**Q3: 企业级架构中,PG 和 ES 的典型分工是什么？**

A) PG 做缓存,ES 做存储
B) PG 做主存储,ES 做搜索层,通过同步保持一致
C) PG 做搜索,ES 做事务

---

## §7. Commit Message

```
docs(teaching): 0039 ES 性能 + 技术对比 + 企业级应用 lesson
```

---

## §8. 跨节链接

- [0038 · Query DSL](./0038-elasticsearch-query-dsl.md) — 查询语法
- [0040 · 错误处理模式](./0040-retry-circuit-breaker.md) — 下一课
- [enterprise-database-architecture.md](./reference/enterprise-database-architecture.md) — 数据库架构参考
