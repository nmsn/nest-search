# nest-search ES 数据 Schema 速查手册

> nest-search 写入 ES 的所有字段定义、类型、用途、查询场景速查。

---

## 索引概览

nest-search 一共 **3 个 ES 索引**，每个业务线一个：

| 业务线 | 索引名 | 含义 |
|--------|--------|------|
| ds (商显) | `products_ds` | 商业显示器、拼接屏、广告机 |
| zk (道闸) | `products_zk` | 道闸、停车场设备、门禁 |
| meeting (会议平板) | `products_meeting` | 会议平板、智能会议设备 |

每个索引共享同一份 Mapping（结构相同），数据按业务线隔离。

---

## 完整 Mapping

```ts
const PRODUCT_MAPPINGS = {
  properties: {
    productId:    { type: 'keyword' },
    name:         { type: 'text', analyzer: 'standard' },
    category:     { type: 'keyword' },
    brand:        { type: 'keyword' },
    model:        { type: 'keyword' },
    spec:         { type: 'text' },
    price:        { type: 'float' },
    unit:         { type: 'keyword' },
    stock:        { type: 'integer' },
    imageUrl:     { type: 'keyword', index: false },
    attributes:   { type: 'object', enabled: false },
    syncedAt:     { type: 'date' },
    businessLine: { type: 'keyword' },
  },
};
```

---

## 字段详细说明

### 1. productId

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **是否分词** | ❌ 不分词 |
| **是否可聚合** | ✅ |
| **示例** | `"P001"`, `"P002"` |
| **数据源** | sync-service mock JSON |
| **用途** | 商品唯一 ID（ES `_id`） |

**查询场景**：

```json
{ "term": { "productId": "P001" } }                    // 精确查
{ "terms": { "productId": ["P001", "P002"] } }         // 批量查
{ "wildcard": { "productId": "P00*" } }                // 前缀查
```

**为什么用 keyword**：
- 不需要全文搜索（订单号、产品 ID 都是精确匹配）
- 节省分词开销
- 支持精确聚合、排序

---

### 2. name

| 属性 | 值 |
|------|-----|
| **类型** | `text` |
| **analyzer** | `standard`（0040 改成 `ik_max_word`） |
| **是否分词** | ✅ |
| **是否可聚合** | ❌（text 不可聚合，要 `name.keyword`） |
| **示例** | `"55寸商用显示器"`, `"海信 65寸 4K 电视"` |
| **数据源** | mock JSON |
| **用途** | 商品名称，全文搜索核心字段 |

**查询场景**：

```json
{ "match": { "name": "显示器" } }                       // 全文搜索
{ "multi_match": { "query": "显示器", "fields": ["name^3", "spec"] } }  // 加权
{ "match_phrase": { "name": "商用显示器" } }           // 短语匹配
```

**0040 改造**：用 IK 替代 standard，详见 [0040 lesson](./0040-elasticsearch-ik-analyzer.md)。

---

### 3. category

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **是否分词** | ❌ |
| **是否可聚合** | ✅ |
| **示例** | `"显示器"`, `"电视"`, `"道闸"`, `"会议平板"` |
| **数据源** | mock JSON |
| **用途** | 商品分类（一级分类），用于过滤 + 聚合 |

**查询场景**：

```json
{ "term": { "category": "显示器" } }                    // 单分类过滤
{ "terms": { "category": ["显示器", "电视"] } }         // 多分类
```

**聚合场景**（Dashboard 分类统计）：

```json
{
  "aggs": {
    "by_category": { "terms": { "field": "category", "size": 20 } }
  }
}
// 返回: [{ key: "显示器", doc_count: 150 }, { key: "电视", doc_count: 80 }]
```

---

### 4. brand

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **是否分词** | ❌ |
| **是否可聚合** | ✅ |
| **示例** | `"Samsung"`, `"海信"`, `"Hisense"`, `"Sony"` |
| **数据源** | mock JSON |
| **用途** | 品牌过滤 + 聚合 |

**查询场景**：与 `category` 类似。

**典型查询**：用户先选 category（"显示器"），再选 brand（"Samsung"），缩小范围。

---

### 5. model

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **是否分词** | ❌ |
| **是否可聚合** | ✅ |
| **示例** | `"PM-55F"`, `"LTI550HN01"` |
| **数据源** | mock JSON |
| **用途** | 型号（具体产品系列号） |

**查询场景**：

```json
{ "term": { "model": "PM-55F" } }                      // 精确型号
{ "wildcard": { "model": "PM-*" } }                    // 系列前缀
```

---

### 6. spec

| 属性 | 值 |
|------|-----|
| **类型** | `text` |
| **是否分词** | ✅（默认 standard） |
| **示例** | `"屏幕尺寸 55 英寸, 分辨率 3840×2160, 刷新率 60Hz"` |
| **数据源** | mock JSON |
| **用途** | 详细规格参数，全文搜索辅助字段 |

**查询场景**：

```json
{ "multi_match": { "query": "3840", "fields": ["name", "spec"] } }
// 用户搜"3840" 能匹配到 4K 规格的商品
```

**注意**：spec 是非结构化文本，搜索"3840×2160"和"3840"可能命中不同结果。

---

### 7. price

| 属性 | 值 |
|------|-----|
| **类型** | `float` |
| **是否分词** | ❌ |
| **示例** | `3999.00`, `2999.50` |
| **数据源** | mock JSON |
| **用途** | 价格范围过滤 + 排序 + 聚合统计 |

**查询场景**：

```json
{ "range": { "price": { "gte": 1000, "lte": 5000 } } }  // 范围过滤
{ "range": { "price": { "gte": 1000, "boost": 2.0 } } } // 加权（贵的优先）
```

**聚合场景**：

```json
{
  "aggs": {
    "price_stats": { "stats": { "field": "price" } }
  }
}
// { min: 99, max: 99999, avg: 4500, count: 500 }
```

**排序**：

```json
{ "sort": [{ "price": "asc" }] }                        // 价格升序
```

---

### 8. unit

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **示例** | `"台"`, `"套"`, `"件"` |
| **数据源** | mock JSON |
| **用途** | 计量单位（暂未在查询中使用） |

**潜在用途**：

```json
{ "terms": { "unit": ["台", "套"] } }                   // 按单位筛选
```

---

### 9. stock

| 属性 | 值 |
|------|-----|
| **类型** | `integer` |
| **示例** | `50`, `0`, `1000` |
| **数据源** | mock JSON |
| **用途** | 库存量，可用于评分加权（库存多优先展示） |

**查询场景**：

```json
{ "range": { "stock": { "gt": 0 } } }                   // 有货商品
{ "term": { "stock": 0 } }                             // 缺货商品
```

**评分场景**（function_score 加权）：

```json
{
  "function_score": {
    "field_value_factor": {
      "field": "stock",
      "modifier": "log1p"                                // 库存越多越靠前
    }
  }
}
```

---

### 10. imageUrl

| 属性 | 值 |
|------|-----|
| **类型** | `keyword`, `index: false` |
| **是否分词** | ❌ |
| **是否索引** | ❌（不参与搜索） |
| **示例** | `"https://cdn.example.com/products/P001.jpg"` |
| **数据源** | mock JSON |
| **用途** | 商品图片 URL（**仅存储，不搜索**） |

**为什么不索引**：
- URL 没有搜索价值
- 不索引节省倒排表空间
- 仍可通过 `_source` 返回给前端

**查询场景**：不参与查询，仅返回。

---

### 11. attributes

| 属性 | 值 |
|------|-----|
| **类型** | `object`, `enabled: false` |
| **是否索引** | ❌（不索引整体） |
| **示例** | `{ "颜色": "黑色", "尺寸": "55寸", "功率": "200W" }` |
| **数据源** | mock JSON |
| **用途** | 动态属性（不同商品有不同属性），仅存储不搜索 |

**`enabled: false` 的作用**：
- ES 不解析 attributes 内部结构
- 仅作为 `_source` 的一部分存储返回
- 节省倒排表空间

**为什么不用 nested**：
- 当前需求不要求按属性搜索
- 如果需要按"颜色 = 黑色"搜索，需要改成 `type: nested`（0041 或后续 lesson 涉及）

**查询场景**：

```json
// ❌ 当前不能查（enabled: false）
{ "term": { "attributes.颜色": "黑色" } }              // 无效

// ✅ 只能整体返回
GET /products_ds/_doc/P001
// 返回 attributes: { 颜色: "黑色", 尺寸: "55寸" }
```

---

### 12. syncedAt

| 属性 | 值 |
|------|-----|
| **类型** | `date` |
| **示例** | `"2026-06-27T10:30:00.000Z"` |
| **数据源** | sync-service 同步时赋值 |
| **用途** | 数据同步时间，用于时间过滤 + 默认排序 |

**查询场景**：

```json
{ "range": { "syncedAt": { "gte": "2026-06-01" } } }    // 6月后同步的
{ "range": { "syncedAt": { "gte": "now-7d" } } }        // 7天内
```

**默认排序**：

```json
{ "sort": [{ "_score": "desc" }, { "syncedAt": "desc" }] }
```

**聚合**（按月分桶）：

```json
{
  "aggs": {
    "by_month": {
      "date_histogram": {
        "field": "syncedAt",
        "calendar_interval": "month",
        "format": "yyyy-MM"
      }
    }
  }
}
```

---

### 13. businessLine

| 属性 | 值 |
|------|-----|
| **类型** | `keyword` |
| **示例** | `"ds"`, `"zk"`, `"meeting"` |
| **数据源** | sync-service 同步时赋值 |
| **用途** | 业务线标识（虽然每个索引对应一个业务线，但字段冗余存储便于跨索引查询） |

**为什么冗余存**：
- 跨索引查询时可以过滤
- 不依赖索引名判断业务线

**查询场景**：

```json
{ "term": { "businessLine": "ds" } }                    // 业务线过滤
```

---

## 字段速查表

| 字段 | 类型 | 分词 | 可聚合 | 主要用途 |
|------|------|------|--------|----------|
| productId | keyword | ❌ | ✅ | 精确 ID 查询 |
| name | text | ✅ | ❌ | 全文搜索（核心） |
| category | keyword | ❌ | ✅ | 分类过滤 + 聚合 |
| brand | keyword | ❌ | ✅ | 品牌过滤 + 聚合 |
| model | keyword | ❌ | ✅ | 型号查询 |
| spec | text | ✅ | ❌ | 详细规格全文搜索 |
| price | float | ❌ | ✅ | 范围 + 排序 + 统计 |
| unit | keyword | ❌ | ✅ | 单位过滤（暂未用） |
| stock | integer | ❌ | ✅ | 库存过滤 + 评分 |
| imageUrl | keyword | ❌ | ❌ | 仅存储（不索引） |
| attributes | object | - | ❌ | 动态属性（仅存储） |
| syncedAt | date | - | ✅ | 时间过滤 + 排序 + 聚合 |
| businessLine | keyword | ❌ | ✅ | 业务线过滤 |

---

## 数据流

```
数据源
  ↓
sync-service (mock JSON 或 PostgreSQL)
  ↓ bulk 写入
ES 索引 (products_ds / products_zk / products_meeting)
  ↓
search-service 接收查询
  ↓
前端展示
```

**写入流程**：

```ts
// sync.consumer.ts
const operations = filtered.flatMap((doc) => [
  { index: { _index: index, _id: doc.productId } },
  doc,  // 整个 Product 对象
]);
await this.esClient.bulk({ operations });
```

`_id` 用 `productId` 保证 upsert 语义（同一 productId 多次写入会覆盖）。

**读取流程**：

```ts
// search.service.ts
const result = await this.esService.search(index, query);
return result.hits.hits.map((hit) => ({
  _id: hit._id,
  _score: hit._score,
  ...hit._source,  // 返回全部 13 个字段
}));
```

---

## 文档示例

```json
{
  "_index": "products_ds",
  "_id": "P001",
  "_score": 1.0,
  "_source": {
    "productId": "P001",
    "name": "55寸商用显示器",
    "category": "显示器",
    "brand": "Samsung",
    "model": "PM-55F",
    "spec": "屏幕尺寸 55 英寸, 分辨率 3840×2160, 刷新率 60Hz",
    "price": 3999.00,
    "unit": "台",
    "stock": 50,
    "imageUrl": "https://cdn.example.com/products/P001.jpg",
    "attributes": {
      "颜色": "黑色",
      "尺寸": "55寸",
      "功率": "200W"
    },
    "syncedAt": "2026-06-27T10:30:00.000Z",
    "businessLine": "ds"
  }
}
```

---

## 完整示例查询

### 场景 1：商显分类 + 全文搜索 + 价格过滤

```json
{
  "from": 0,
  "size": 20,
  "query": {
    "bool": {
      "must": [
        { "multi_match": { "query": "显示器", "fields": ["name^3", "spec"] } }
      ],
      "filter": [
        { "term": { "category": "显示器" } },
        { "term": { "brand": "Samsung" } },
        { "range": { "price": { "gte": 1000, "lte": 10000 } } }
      ]
    }
  },
  "sort": [
    { "_score": "desc" },
    { "syncedAt": "desc" }
  ]
}
```

### 场景 2：分类聚合

```json
{
  "size": 0,
  "query": { "term": { "businessLine": "ds" } },
  "aggs": {
    "by_category": { "terms": { "field": "category", "size": 20 } },
    "by_brand": { "terms": { "field": "brand", "size": 20 } },
    "price_stats": { "stats": { "field": "price" } }
  }
}
```

### 场景 3：库存评分加权

```json
{
  "query": {
    "function_score": {
      "query": { "match": { "name": "显示器" } },
      "field_value_factor": {
        "field": "stock",
        "modifier": "log1p",
        "missing": 0
      },
      "boost_mode": "multiply"
    }
  }
}
```

---

## 后续改造（0040-0047 涉及）

| 改造 | 影响字段 | lesson |
|------|----------|--------|
| IK 中文分词 | `name`, `spec` | 0040 |
| pinyin 拼音搜索 | 新增 `name_pinyin` | 0040 |
| 同义词词典 | `name`, `spec` | 0040 |
| nested 属性搜索 | `attributes`（改为 `type: nested`）| 待定 |
| search_after 深分页 | 所有字段 | 0042 |
| 滚动索引 | 索引名（`products_ds_2026_06`）| 0045 |
| ILM | 索引策略 | 0045 |
| 高亮 | 所有 text 字段 | 0047 |

---

**参考**：
- [0037 · ES 基础](./0037-elasticsearch-fundamentals.md)
- [0038 · Query DSL 速查](./elasticsearch-query-dsl-cheatsheet.md)
- [0040 · IK 中文分词](./0040-elasticsearch-ik-analyzer.md)
- [elasticsearch.init.ts](../../apps/search-service/src/elasticsearch/elasticsearch.init.ts) — Mapping 定义
- [product.interface.ts](../../apps/sync-service/src/libs/shared/interfaces/product.interface.ts) — 数据源类型
