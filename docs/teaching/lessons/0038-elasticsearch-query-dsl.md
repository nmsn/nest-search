# 0038 · Elasticsearch Query DSL 语法详解

> Phase B 第 9 课。0037 讲了核心概念和倒排索引,0038 深入 **Query DSL**——ES 的查询语言。所有查询都是 JSON 结构,比 SQL 更灵活但也更复杂。

## 你今天会拿到什么

1. 掌握 **3 种基本查询**：match、term、range
2. 掌握 **bool 复合查询**：must / should / must_not / filter
3. 掌握 **聚合查询 (aggs)**：terms、stats、date_histogram
4. 理解 **分页 + 排序**：from/size + sort
5. 看懂 nest-search 的查询代码并能自己写

---

## §1. Query vs Filter Context

ES 查询有两种上下文,理解这个是写好查询的前提：

| 上下文 | 作用 | 是否评分 | 示例 |
|--------|------|---------|------|
| **Query** | 匹配相关性 | ✅ 影响 `_score` | `match`, `multi_match` |
| **Filter** | 精确过滤 | ❌ 不评分,可缓存 | `term`, `range`, `exists` |

**经验法则**：
- 全文搜索 → Query context
- 精确条件 → Filter context

---

## §2. 基本查询

### 2.1 match（全文搜索）

```json
// 对 text 字段做分词搜索
{
  "query": {
    "match": {
      "name": "55寸显示器"
    }
  }
}
// 分词后: ["55", "寸", "显示器"]
// 匹配包含任意词项的文档
```

### 2.2 multi_match（多字段搜索）

```json
// 同时搜索多个字段
{
  "query": {
    "multi_match": {
      "query": "显示器",
      "fields": ["name^3", "spec", "brand"]
      // name 权重 x3,spec 和 brand 权重 1
    }
  }
}
// 等价于: name:显示器^3 OR spec:显示器 OR brand:显示器
```

### 2.3 term（精确匹配）

```json
// 对 keyword 字段做精确匹配
// ⚠️ 不分词!不要用在 text 字段上
{
  "query": {
    "term": {
      "category": "显示器"
    }
  }
}
```

**常见错误**：

```json
// ❌ 错误:term 用于 text 字段
{ "term": { "name": "55寸显示器" } }
// 因为 text 字段被分词了,"55寸显示器" 这个完整字符串在倒排索引里不存在

// ✅ 正确:用 match
{ "match": { "name": "55寸显示器" } }
```

### 2.4 range（范围查询）

```json
// 数值或日期范围
{
  "query": {
    "range": {
      "price": {
        "gte": 1000,    // >=
        "lte": 5000,    // <=
        "boost": 2.0    // 评分权重
      }
    }
  }
}
```

日期范围：

```json
{
  "range": {
    "syncedAt": {
      "gte": "2026-01-01",
      "lte": "2026-06-30",
      "format": "yyyy-MM-dd"
    }
  }
}
```

---

## §3. bool 复合查询

```json
{
  "query": {
    "bool": {
      "must": [],        // 必须匹配 (AND, 评分)
      "should": [],      // 应该匹配 (OR, 评分)
      "must_not": [],    // 必须不匹配 (NOT, 不评分)
      "filter": []       // 必须匹配 (AND, 不评分, 可缓存)
    }
  }
}
```

### nest-search 的实际用法

```ts
// search.queries.ts 中的 buildProductSearchQuery
const must: any[] = [];
const filter: any[] = [];

// 关键词搜索 → must (影响评分)
if (params.keyword) {
  must.push({
    multi_match: {
      query: params.keyword,
      fields: ['name^3', 'spec', 'brand', 'model'],
    },
  });
}

// 分类过滤 → filter (不影响评分)
if (params.category) {
  filter.push({ term: { category: params.category } });
}

// 品牌过滤 → filter
if (params.brand) {
  filter.push({ term: { brand: params.brand } });
}

// 组合
return {
  query: {
    bool: {
      must: must.length > 0 ? must : [{ match_all: {} }],
      filter,
    },
  },
};
```

**解析**：

```
用户搜索: keyword="显示器", category="显示器", brand="Samsung"

生成的查询:
bool: {
  must: [{ multi_match: { query: "显示器", fields: [...] } }],  // 全文搜索
  filter: [
    { term: { category: "显示器" } },  // 精确过滤
    { term: { brand: "Samsung" } },
  ]
}

结果: name/spec 中包含 "显示器" 的文档
      AND category = "显示器"
      AND brand = "Samsung"
```

---

## §4. 聚合查询 (Aggregations)

聚合是 ES 的另一个杀手锏——不只是搜索,还能做**数据分析**。

### 4.1 terms 聚合（分桶统计）

```json
// 统计每个分类有多少商品
{
  "size": 0,  // 不返回文档,只返回聚合结果
  "aggs": {
    "categories": {
      "terms": { "field": "category", "size": 50 }
    }
  }
}
// 结果: { buckets: [{ key: "显示器", doc_count: 150 }, ...] }
```

### 4.2 stats 聚合（统计值）

```json
// 价格统计
{
  "size": 0,
  "aggs": {
    "price_stats": {
      "stats": { "field": "price" }
    }
  }
}
// 结果: { min: 99, max: 9999, avg: 2500, count: 500, sum: 1250000 }
```

### 4.3 组合聚合

```json
// 同时查分类、品牌、价格统计
{
  "size": 0,
  "aggs": {
    "categories": {
      "terms": { "field": "category", "size": 50 }
    },
    "brands": {
      "terms": { "field": "brand", "size": 50 }
    },
    "price_stats": {
      "stats": { "field": "price" }
    }
  }
}
```

这就是 nest-search 的 `buildAggregationQuery()` 在做的事。

---

## §5. 分页 + 排序

```json
{
  "query": { "match_all": {} },
  "from": 0,           // 起始位置
  "size": 10,          // 每页数量
  "sort": [
    { "_score": "desc" },        // 先按相关性排序
    { "syncedAt": "desc" }       // 再按同步时间倒序
  ]
}
```

**深分页问题**：

```json
// ❌ 不推荐:from=10000, size=10
// ES 需要查询 10010 条文档然后丢弃前 10000 条
// 性能随 from 增大线性下降

// ✅ 推荐:用 search_after
{
  "size": 10,
  "sort": [{ "price": "asc" }, { "_id": "asc" }],
  "search_after": [1000, "doc_id_123"]
  // 从上一页最后一条的 sort 值开始
}
```

---

## §6. 实战：改造 nest-search 查询

### 添加价格范围过滤

```ts
// 在 buildProductSearchQuery 中加价格范围
if (params.minPrice !== undefined || params.maxPrice !== undefined) {
  const range: any = {};
  if (params.minPrice !== undefined) range.gte = params.minPrice;
  if (params.maxPrice !== undefined) range.lte = params.maxPrice;
  filter.push({ range: { price: range } });
}
```

### 添加排序选项

```ts
// 支持按价格排序
const sort: any[] = [];
if (params.sortBy === 'price') {
  sort.push({ price: params.sortOrder || 'asc' });
} else {
  sort.push({ _score: 'desc' }, { syncedAt: 'desc' });
}
```

---

## §7. Quiz

**Q1: `match` 和 `term` 的区别是什么？**

A) match 用于 keyword,term 用于 text
B) match 对 text 做分词搜索,term 对 keyword 做精确匹配
C) 没有区别,可以互换

**Q2: `bool` 查询中 `filter` 的好处是什么？**

A) 比 must 查询更快
B) 不参与评分,可被缓存,性能更好
C) 可以查询更多字段

**Q3: 聚合查询中 `size: 0` 的作用是什么？**

A) 返回 0 条聚合结果
B) 不返回文档,只返回聚合结果,节省带宽
C) 限制聚合桶数为 0

---

## §8. Commit Message

```
docs(teaching): 0038 Elasticsearch Query DSL lesson
```

---

## §9. 跨节链接

- [0037 · ES 基础](./0037-elasticsearch-fundamentals.md) — 核心概念 + 倒排索引
- [0039 · ES 性能 + 企业级](./0039-elasticsearch-performance-enterprise.md) — 下一课
- [search.queries.ts](../../apps/search-service/src/search/search.queries.ts) — nest-search 的查询实现
