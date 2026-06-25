# 0037 · Elasticsearch 基础：核心概念 + 倒排索引

> Phase B 第 8 课。0036 做完 RabbitMQ,0037 进入 **Elasticsearch**——search-service 已经在用,但没有教学。本节讲 ES 的核心概念和底层原理。

## 你今天会拿到什么

1. 理解 **Elasticsearch 是什么**（分布式搜索引擎,不是数据库）
2. 掌握 **5 个核心概念**：Index、Document、Mapping、Analyzer、Shard
3. 理解 **倒排索引原理**（为什么全文搜索比 LIKE 快 1000 倍）
4. 看懂 nest-search 的 ES 代码在做什么
5. 3 道 quiz

---

## §1. Elasticsearch 是什么？

**一句话**：Elasticsearch 是一个**分布式、RESTful 风格的搜索和分析引擎**。

**不是数据库**。虽然它存数据,但它的设计目标是**搜索**,不是事务性 CRUD。

| 特性 | PostgreSQL | Elasticsearch |
|------|-----------|---------------|
| 设计目标 | 事务性存储 | 搜索 + 分析 |
| 数据模型 | 行 + 列(关系型) | Document(JSON) |
| 查询语言 | SQL | Query DSL (JSON) |
| 事务支持 | ✅ ACID | ❌ 无事务 |
| 全文搜索 | `LIKE '%keyword%'` (慢) | 倒排索引 (极快) |
| 实时性 | 写入即可查 | 近实时(~1 秒延迟) |

---

## §2. 5 个核心概念

### 2.1 Index（索引）

```ts
// 类比:PostgreSQL 的 table
// 一个 Index 存一类 Document
// nest-search 里:products-ds, products-zk, products-meeting
```

**命名规范**：小写,用 `-` 分隔（不是 `_`）。

### 2.2 Document（文档）

```json
// 类比:PostgreSQL 的 row
// 一个 Document 就是一个 JSON 对象
{
  "productId": "P001",
  "name": "55寸商用显示器",
  "category": "显示器",
  "brand": "Samsung",
  "price": 3999.00,
  "stock": 50
}
```

每个 Document 有唯一 `_id`（类似主键）。

### 2.3 Mapping（映射）

```ts
// 类比:PostgreSQL 的 schema (列定义)
// 定义每个字段的类型和索引方式
// nest-search 的 mapping (elasticsearch.init.ts):
{
  properties: {
    productId: { type: 'keyword' },      // 精确匹配,不分词
    name: { type: 'text', analyzer: 'standard' },  // 全文搜索,分词
    category: { type: 'keyword' },       // 精确匹配
    price: { type: 'float' },            // 数值范围查询
    syncedAt: { type: 'date' },          // 日期
  }
}
```

**关键字段类型**：

| 类型 | 用途 | 示例 |
|------|------|------|
| `keyword` | 精确匹配、排序、聚合 | category, brand |
| `text` | 全文搜索（会被分词） | name, spec |
| `integer/float/long` | 数值范围查询 | price, stock |
| `date` | 日期范围 | syncedAt |
| `boolean` | 布尔过滤 | enabled |

### 2.4 Analyzer（分析器）

**分词过程**：

```
"55寸商用显示器"
    ↓ character filter (去特殊字符)
"55寸商用显示器"
    ↓ tokenizer (分词)
["55", "寸", "商用", "显示器"]
    ↓ token filter (小写、去停用词)
["55", "commercial", "display"]  // standard analyzer 英文效果
```

**常用分析器**：

| 分析器 | 适用场景 |
|--------|---------|
| `standard` | 默认,英文分词好 |
| `simple` | 按非字母字符切分 |
| `whitespace` | 按空格切分 |
| `keyword` | 不分词,整个字段作为一个 term |

### 2.5 Shard（分片）

```
一个 Index 可以拆成多个 Shard
每个 Shard 是一个独立的 Lucene 实例
分布在不同节点上 → 水平扩展

Index: products-ds
├── Shard 0 (Node 1)
├── Shard 1 (Node 2)
└── Shard 2 (Node 3)
```

**默认**：1 个主分片 + 1 个副本。生产环境建议：**主分片数 = 节点数 × 1.5**。

---

## §3. 倒排索引原理

**正排索引**（PostgreSQL 的 B-tree）：

```
Document → 词项
P001 → ["55", "寸", "商用", "显示器"]
P002 → ["32", "寸", "家用", "电视"]
```

**倒排索引**（Elasticsearch 的核心）：

```
词项 → Document 列表
"显示器" → [P001, P003, P007]
"电视"   → [P002, P005]
"寸"     → [P001, P002, P003, P004, P005]
```

**查询 "显示器"**：
- B-tree：扫描所有行,`WHERE name LIKE '%显示器%'` → O(n)
- 倒排索引：直接查 `["显示器"]` → [P001, P003, P007] → O(1) lookup + O(k) 取文档

**100 万数据量**：
- `LIKE '%keyword%'` → 1000ms+
- 倒排索引 → 10ms

---

## §4. nest-search 的 ES 代码解读

### 索引初始化 (elasticsearch.init.ts)

```ts
// 定义 mapping → 创建索引（如果不存在）
const PRODUCT_MAPPINGS = {
  properties: {
    productId: { type: 'keyword' },      // 不分词,精确匹配
    name: { type: 'text', analyzer: 'standard' },  // 分词,全文搜索
    category: { type: 'keyword' },       // 不分词,用于聚合
    price: { type: 'float' },            // 数值,用于范围查询
  },
};

await esService.createIndexIfNotExists('products-ds', PRODUCT_MAPPINGS);
```

### 搜索查询 (search.queries.ts)

```ts
// bool query: must(影响评分) + filter(不影响评分,可缓存)
{
  query: {
    bool: {
      must: [
        { multi_match: { query: "显示器", fields: ["name^3", "spec"] } }
        // name^3 = name 字段权重 x3
      ],
      filter: [
        { term: { category: "显示器" } },  // 精确过滤
        { term: { brand: "Samsung" } },
      ]
    }
  }
}
```

**must vs filter**：
- `must`：参与评分（影响搜索结果排序）
- `filter`：只过滤,不评分（性能更好,可被缓存）

---

## §5. Quiz

**Q1: Elasticsearch 的倒排索引为什么比 PostgreSQL 的 LIKE 快？**

A) 因为 ES 用了更快的 CPU
B) 因为倒排索引直接查词项→文档列表,不需要全表扫描
C) 因为 ES 的硬盘更快

**Q2: Mapping 中 `keyword` 和 `text` 类型的区别是什么？**

A) keyword 存储空间更小
B) keyword 不分词用于精确匹配,text 分词用于全文搜索
C) 没有区别,可以互换使用

**Q3: `bool` 查询中 `must` 和 `filter` 的区别是什么？**

A) must 是 AND,filter 是 OR
B) must 参与评分排序,filter 只过滤不评分
C) must 用于字符串,filter 用于数字

---

## §6. Commit Message

```
docs(teaching): 0037 Elasticsearch 基础 lesson
```

---

## §7. 跨节链接

- [0036 · RabbitMQ 深度](./0036-rabbitmq-deep-dive.md) — 上一课
- [0038 · Query DSL 语法](./0038-elasticsearch-query-dsl.md) — 下一课
- [search-service 代码](../../apps/search-service/src/) — nest-search 的 ES 实现
