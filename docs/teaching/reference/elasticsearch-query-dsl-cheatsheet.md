# Elasticsearch Query DSL 速查手册

> 留档：所有 ES 查询字段的速查表，按"查询类型"分类。

---

## 目录

- [§1. 基本查询](#1-基本查询)
  - [match](#match)
  - [multi_match](#multi_match)
  - [match_phrase](#match_phrase)
  - [match_phrase_prefix](#match_phrase_prefix)
  - [term](#term)
  - [terms](#terms)
  - [range](#range)
  - [exists](#exists)
  - [prefix](#prefix)
  - [wildcard](#wildcard)
  - [regexp](#regexp)
  - [fuzzy](#fuzzy)
  - [ids](#ids)
- [§2. 复合查询](#2-复合查询)
  - [bool](#bool)
  - [boosting](#boosting)
- [§3. 连接查询](#3-连接查询)
  - [nested](#nested)
  - [has_child / has_parent](#has_child--has_parent)
- [§4. 评分控制](#4-评分控制)
  - [function_score](#function_score)
  - [script_score](#script_score)
  - [constant_score](#constant_score)
  - [dis_max](#dis_max)
- [§5. 聚合查询](#5-聚合查询)
  - [terms](#terms-1)
  - [stats / min / max / avg / sum](#stats--min--max--avg--sum)
  - [date_histogram](#date_histogram)
  - [histogram](#histogram)
  - [range](#range-1)
  - [composite](#composite)
  - [nested 嵌套聚合](#nested-嵌套聚合)
- [§6. 分页与排序](#6-分页与排序)
  - [from / size](#from--size)
  - [search_after + PIT](#search_after--pit)
  - [sort](#sort)
- [§7. 高亮与提示](#7-高亮与提示)
  - [highlight](#highlight)
  - [suggest](#suggest)
- [§8. 性能与调试](#8-性能与调试)
  - [profile](#profile)
  - [explain](#explain)
  - [_source 过滤](#_source-过滤)
  - [docvalue_fields](#docvalue_fields)

---

## §1. 基本查询

### match

**用途**：对 `text` 字段做分词全文搜索。

**含义**：先分词查询串，再匹配**任一**词项（默认 OR）。

```json
{
  "query": {
    "match": {
      "name": "55寸显示器"
    }
  }
}
// "55寸显示器" → ["55", "寸", "显示器"]
// 匹配包含任一词的文档
```

**常用参数**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `query` | 查询文本 | - |
| `operator` | `and` / `or` | `or` |
| `minimum_should_match` | 至少匹配百分比/数量 | - |
| `fuzziness` | 模糊匹配容忍度 | `AUTO` |
| `boost` | 评分权重 | 1.0 |

**示例（强制全部匹配）**：

```json
{ "match": { "name": { "query": "显示器", "operator": "and" } } }
```

---

### multi_match

**用途**：同时查询多个字段。

```json
{
  "query": {
    "multi_match": {
      "query": "显示器",
      "fields": ["name^3", "spec", "brand"]
    }
  }
}
```

`^3` 表示 name 字段权重乘 3。

**type 参数**（控制多字段匹配策略）：

| type | 行为 | 适用场景 |
|------|------|----------|
| `best_fields` | 取最匹配字段的分数 | 大多数全文搜索（默认） |
| `most_fields` | 多个字段分数相加 | 同一文本在多字段表示 |
| `cross_fields` | 把字段当作一个整体 | 跨字段搜索（如人名） |
| `phrase` | 按 phrase 匹配 | 精确短语 |
| `phrase_prefix` | 短语前缀 | 搜索建议 |

**示例（cross_fields）**：

```json
{
  "multi_match": {
    "query": "海信 65寸",
    "type": "cross_fields",
    "fields": ["brand", "name", "spec"]
  }
}
```

---

### match_phrase

**用途**：精确短语匹配（词项必须**相邻**且按顺序）。

```json
{ "query": { "match_phrase": { "name": "商用显示器" } } }
```

**slop 参数**：允许词项之间有最多 N 个词的距离。

```json
{ "match_phrase": { "name": { "query": "显示器", "slop": 2 } } }
// 匹配 "商用 4K 显示器"（中间隔了 2 个词）
```

---

### match_phrase_prefix

**用途**：短语前缀匹配，搜索建议（输入 "Sams" → 匹配 "Samsung"）。

```json
{ "match_phrase_prefix": { "name": "Sam" } }
```

**注意**：性能较差（要扫描所有倒排项），生产环境建议用 `completion suggester` 替代。

---

### term

**用途**：对 `keyword` / 数值 / 日期做**精确**匹配（**不分词**）。

```json
{ "term": { "category": "显示器" } }
{ "term": { "price": 3999 } }
{ "term": { "syncedAt": "2026-06-27" } }
```

**常见错误**：

```json
// ❌ 错误：term 用于 text 字段
{ "term": { "name": "55寸显示器" } }
// text 字段被分词，"55寸显示器" 整体不在倒排索引里

// ✅ 正确：text 字段用 match
{ "match": { "name": "55寸显示器" } }
```

---

### terms

**用途**：匹配**多个值**中的任一值（OR）。

```json
{ "terms": { "category": ["显示器", "电视", "笔记本"] } }
```

**boost 参数**：

```json
{
  "terms": {
    "category": [
      { "value": "显示器", "boost": 2.0 },
      { "value": "电视", "boost": 1.0 }
    ]
  }
}
// "显示器" 类别评分翻倍
```

---

### range

**用途**：数值 / 日期范围查询。

```json
{
  "range": {
    "price": {
      "gte": 1000,
      "lte": 5000,
      "boost": 2.0
    }
  }
}
```

**操作符**：

| 操作符 | 含义 |
|--------|------|
| `gte` | ≥ |
| `gt` | > |
| `lte` | ≤ |
| `lt` | < |

**日期格式**：

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
// 也支持日期数学：now-1d, now/M（本月第一天）
```

---

### exists

**用途**：检查字段是否存在（非 null）。

```json
{ "exists": { "field": "imageUrl" } }
```

**典型场景**：过滤有图片的商品。

---

### prefix

**用途**：前缀匹配（不分词）。

```json
{ "prefix": { "productId": "P00" } }
// 匹配 P001, P002, P003, ...
```

**注意**：性能差（要扫描所有 term），生产环境用 `keyword` + `wildcard` 或 `search_as_you_type`。

---

### wildcard

**用途**：通配符匹配（`?` 单字符，`*` 多字符）。

```json
{ "wildcard": { "productId": "P*1" } }
// 匹配 P001, P101, P0001
```

**注意**：性能很差（要遍历 term 树），避免前缀用 `*`。

---

### regexp

**用途**：正则表达式匹配。

```json
{ "regexp": { "productId": "P[0-9]{3}" } }
```

**注意**：正则复杂度影响性能，慎用。

---

### fuzzy

**用途**：模糊匹配（编辑距离容错）。

```json
{ "fuzzy": { "name": { "value": "显示器", "fuzziness": 2 } } }
// "显示" 也能匹配 "显示器"（编辑距离 1）
```

**fuzziness 建议**：
- 长度 0-2: fuzziness 0（不允许错）
- 长度 3-5: fuzziness 1
- 长度 > 5: fuzziness 2

---

### ids

**用途**：按 `_id` 查文档。

```json
{ "ids": { "values": ["P001", "P002", "P003"] } }
```

---

## §2. 复合查询

### bool

**用途**：组合多个查询（最常用）。

```json
{
  "query": {
    "bool": {
      "must":     [],  // 必须匹配，AND，评分
      "should":   [],  // 应该匹配，OR，评分
      "must_not": [],  // 必须不匹配，NOT，不评分
      "filter":   []   // 必须匹配，AND，不评分，可缓存
    }
  }
}
```

**最小匹配数**（should 子句）：

```json
{
  "bool": {
    "should": [
      { "match": { "name": "显示器" } },
      { "match": { "spec": "显示器" } }
    ],
    "minimum_should_match": 1  // 至少匹配 1 个
  }
}
```

**参数**：

| 参数 | 说明 |
|------|------|
| `must` | AND，参与评分 |
| `should` | OR，参与评分（无 must 时需 minimum_should_match） |
| `must_not` | NOT，不参与评分 |
| `filter` | AND，不参与评分，可被缓存 |

**完整示例**：

```json
{
  "query": {
    "bool": {
      "must": [
        { "multi_match": { "query": "显示器", "fields": ["name^3", "spec"] } }
      ],
      "filter": [
        { "term": { "category": "显示器" } },
        { "term": { "brand": "Samsung" } },
        { "range": { "price": { "gte": 1000, "lte": 5000 } } },
        { "exists": { "field": "imageUrl" } }
      ],
      "must_not": [
        { "term": { "stock": 0 } }
      ]
    }
  }
}
```

---

### boosting

**用途**：降低（不是排除）某些文档的相关性。

```json
{
  "query": {
    "boosting": {
      "positive": { "match": { "name": "显示器" } },
      "negative": { "match": { "name": "二手" } },
      "negative_boost": 0.2
    }
  }
}
// 含"二手"的文档评分 ×0.2（仍会返回）
```

---

## §3. 连接查询

### nested

**用途**：查询嵌套对象（mapping 中 `type: nested`）。

```json
{
  "query": {
    "nested": {
      "path": "attributes",
      "query": {
        "bool": {
          "must": [
            { "term": { "attributes.key": "颜色" } },
            { "term": { "attributes.value": "黑色" } }
          ]
        }
      }
    }
  }
}
```

---

### has_child / has_parent

**用途**：父子文档查询（mapping 中 `type: join`）。

```json
{
  "query": {
    "has_child": {
      "type": "comment",
      "query": { "match": { "content": "好评" } }
    }
  }
}
```

---

## §4. 评分控制

### function_score

**用途**：自定义评分函数。

```json
{
  "query": {
    "function_score": {
      "query": { "match": { "name": "显示器" } },
      "functions": [
        {
          "filter": { "term": { "category": "显示器" } },
          "weight": 2
        },
        {
          "field_value_factor": {
            "field": "stock",
            "modifier": "log1p",
            "missing": 0
          }
        }
      ],
      "score_mode": "sum",
      "boost_mode": "multiply"
    }
  }
}
```

**functions 类型**：

| 类型 | 用途 |
|------|------|
| `weight` | 简单权重 |
| `field_value_factor` | 字段值算分（如库存越多越靠前） |
| `decay functions` | 距离衰减（gauss / linear / exp） |
| `script_score` | 脚本算分 |
| `random_score` | 随机评分 |

**score_mode**：多函数合并方式（`multiply` / `sum` / `avg` / `first` / `max` / `min`）

**boost_mode**：与 query 分数合并方式（`multiply` / `replace` / `sum` / `avg` / `max` / `min`）

---

### script_score

**用途**：用 Painless 脚本算分。

```json
{
  "query": {
    "script_score": {
      "query": { "match_all": {} },
      "script": {
        "source": "Math.log(2 + doc['stock'].value)"
      }
    }
  }
}
```

---

### constant_score

**用途**：把查询包装为常数分数（filter 也能用，但 constant_score 兼容老语法）。

```json
{
  "query": {
    "constant_score": {
      "filter": { "term": { "category": "显示器" } },
      "boost": 1.0
    }
  }
}
```

---

### dis_max

**用途**：取多子句中**最高分**（不用相加）。

```json
{
  "query": {
    "dis_max": {
      "queries": [
        { "term": { "name": "显示器" } },
        { "term": { "spec": "显示器" } }
      ],
      "tie_breaker": 0.3
    }
  }
}
```

---

## §5. 聚合查询

### terms

**用途**：按字段值分桶。

```json
{
  "aggs": {
    "categories": {
      "terms": { "field": "category", "size": 50 }
    }
  }
}
// 结果: { buckets: [{ key: "显示器", doc_count: 150 }, ...] }
```

**关键参数**：

| 参数 | 说明 |
|------|------|
| `field` | 聚合字段（**必须是 keyword 或 numeric**） |
| `size` | 返回桶数（默认 10） |
| `order` | 排序方式 |
| `min_doc_count` | 最小文档数（过滤掉小桶） |
| `include` / `exclude` | 包含/排除某些值 |
| `missing` | 缺失值的桶名 |

**text 字段聚合**：

```json
// ❌ 错误：text 字段不能直接聚合
{ "terms": { "field": "name" } }

// ✅ 正确：用 name.keyword 子字段
{ "terms": { "field": "name.keyword" } }
```

---

### stats / min / max / avg / sum

**用途**：数值统计。

```json
{
  "aggs": {
    "price_stats": { "stats": { "field": "price" } }
  }
}
// { count, min, max, avg, sum }
```

**单独指标**：

```json
{
  "aggs": {
    "min_price": { "min": { "field": "price" } },
    "max_price": { "max": { "field": "price" } },
    "avg_price": { "avg": { "field": "price" } }
  }
}
```

---

### date_histogram

**用途**：按时间分桶。

```json
{
  "aggs": {
    "sales_over_time": {
      "date_histogram": {
        "field": "syncedAt",
        "calendar_interval": "month",
        "format": "yyyy-MM"
      }
    }
  }
}
// [{ key_as_string: "2026-01", doc_count: 100 }, ...]
```

**interval 选项**：

| 类型 | 取值 |
|------|------|
| `calendar_interval` | `minute` / `hour` / `day` / `week` / `month` / `quarter` / `year` |
| `fixed_interval` | `1s` / `10m` / `2h`（固定秒数） |

---

### histogram

**用途**：按数值区间分桶（类似 date_histogram 但用数值）。

```json
{
  "aggs": {
    "price_ranges": {
      "histogram": {
        "field": "price",
        "interval": 1000,
        "min_doc_count": 0
      }
    }
  }
}
// [0-1000, 1000-2000, 2000-3000, ...]
```

---

### range

**用途**：自定义范围分桶。

```json
{
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "to": 1000 },
          { "from": 1000, "to": 5000 },
          { "from": 5000 }
        ]
      }
    }
  }
}
```

---

### composite

**用途**：分页式聚合（terms 桶太多时用）。

```json
{
  "aggs": {
    "my_composite": {
      "composite": {
        "size": 10,
        "sources": [
          { "category": { "terms": { "field": "category" } } },
          { "brand": { "terms": { "field": "brand" } } }
        ]
      },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } }
      }
    }
  }
}
```

**分页**：传 `after_key` 给下一轮。

```json
{
  "aggs": {
    "my_composite": {
      "composite": {
        "size": 10,
        "sources": [...],
        "after": { "category": "显示器", "brand": "Samsung" }
      }
    }
  }
}
```

---

### nested 嵌套聚合

**用途**：聚合嵌套对象内层字段。

```json
{
  "aggs": {
    "attributes_nested": {
      "nested": { "path": "attributes" },
      "aggs": {
        "key_values": {
          "terms": { "field": "attributes.key", "size": 10 },
          "aggs": {
            "value_count": {
              "terms": { "field": "attributes.value", "size": 10 }
            }
          }
        }
      }
    }
  }
}
```

---

## §6. 分页与排序

### from / size

**用途**：最简单分页。

```json
{
  "from": 0,
  "size": 20,
  "query": { "match_all": {} }
}
```

**限制**：`from + size ≤ 10000`（`index.max_result_window`），超过会报错。

---

### search_after + PIT

**用途**：深分页（避开 10000 限制）。

**步骤 1：打开 PIT**（point-in-time，固定数据快照）

```json
POST /products_ds/_pit?keep_alive=1m
```

**步骤 2：search_after 查第一页**

```json
{
  "size": 20,
  "pit": { "id": "pit_id_from_step_1", "keep_alive": "1m" },
  "sort": [
    { "price": "asc" },
    { "_id": "asc" }
  ]
}
```

**步骤 3：用上一页最后一条的 sort 值查下一页**

```json
{
  "size": 20,
  "pit": { "id": "pit_id", "keep_alive": "1m" },
  "sort": [
    { "price": "asc" },
    { "_id": "asc" }
  ],
  "search_after": [3999, "P001"]
}
```

**为什么比 from/size 快**？
- from/size：每次都从头扫，丢前 N 条
- search_after：直接从 sort 值定位，O(1) 跳转

---

### sort

**用途**：排序。

```json
{
  "sort": [
    { "_score": "desc" },
    { "syncedAt": "desc" },
    { "price": { "order": "asc", "missing": "_last" } }
  ]
}
```

**关键点**：
- 排序字段不能分词（用 `keyword` 或 `numeric`）
- 多字段排序：从前到后优先级
- `_id` 排序：避免分页漏数据（必须有唯一性兜底）

---

## §7. 高亮与提示

### highlight

**用途**：高亮匹配关键词（前端用 `<em>` 标签）。

```json
{
  "query": { "match": { "name": "显示器" } },
  "highlight": {
    "fields": {
      "name": {
        "pre_tags": ["<em>"],
        "post_tags": ["</em>"],
        "number_of_fragments": 0
      }
    }
  }
}
```

`number_of_fragments: 0` 返回整个字段而不是片段。

---

### suggest

**用途**：搜索建议（自动补全 / 拼写纠错）。

```json
{
  "suggest": {
    "my_suggestion": {
      "text": "Samsng",
      "term": {
        "field": "brand",
        "suggest_mode": "always"
      }
    }
  }
}
// 返回: [{ text: "Samsng", options: [{ text: "Samsung" }] }]
```

**completion suggester**（更专业）：

```json
{
  "suggest": {
    "product_suggest": {
      "prefix": "sam",
      "completion": {
        "field": "suggest_input",
        "size": 10
      }
    }
  }
}
```

---

## §8. 性能与调试

### profile

**用途**：查看查询执行细节（哪些步骤慢）。

```json
{
  "profile": true,
  "query": { "match": { "name": "显示器" } }
}
```

返回结果包含：
- `query`: query 阶段耗时
- `rewrite_time`: 重写耗时
- `collector`: 收集器耗时
- 每个子查询的 `breakdown`（build_scorer / next_doc / match 等）

---

### explain

**用途**：解释某文档的评分。

```json
GET /products_ds/_explain/P001
{
  "query": { "match": { "name": "显示器" } }
}
```

返回评分明细：`tf`（词频）、`idf`（逆文档频率）、`fieldBoost` 等。

---

### _source 过滤

**用途**：只返回需要的字段，节省带宽。

```json
{
  "_source": ["productId", "name", "price"],
  "query": { "match_all": {} }
}
```

**includes / excludes**：

```json
{ "_source": { "includes": ["*.name", "*.price"], "excludes": ["*.description"] } }
```

---

### docvalue_fields

**用途**：直接返回字段原始值（不查 `_source`）。

```json
{
  "docvalue_fields": ["price", "syncedAt"],
  "query": { "match_all": {} }
}
```

比查 `_source` 快（`_source` 要从 store 取）。

---

## §9. 常用查询模式速查

### 模式 1：全文搜索 + 多条件过滤

```json
{
  "query": {
    "bool": {
      "must": [{ "multi_match": { "query": "显示器", "fields": ["name^3", "spec"] } }],
      "filter": [
        { "term": { "category": "显示器" } },
        { "range": { "price": { "gte": 1000, "lte": 5000 } } }
      ]
    }
  }
}
```

### 模式 2：聚合 + 简单过滤

```json
{
  "size": 0,
  "query": { "term": { "businessLine": "ds" } },
  "aggs": {
    "by_category": { "terms": { "field": "category" } },
    "price_stats": { "stats": { "field": "price" } }
  }
}
```

### 模式 3：深分页

```json
{
  "pit": { "id": "...", "keep_alive": "1m" },
  "size": 20,
  "sort": [{ "price": "asc" }, { "_id": "asc" }],
  "search_after": [3999, "P001"]
}
```

### 模式 4：搜索 + 高亮

```json
{
  "query": { "match": { "name": "显示器" } },
  "highlight": {
    "fields": { "name": { "number_of_fragments": 0 } }
  }
}
```

### 模式 5：自定义评分（库存越多越靠前）

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

## §10. 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `term` 查 text 字段无结果 | text 被分词了 | 改用 `match`，或加 `.keyword` |
| 聚合 `text` 字段报错 | text 不支持聚合 | 改用 `field.keyword` |
| `from + size > 10000` | 默认 result window 限制 | 改用 `search_after` + PIT |
| 中文分词差 | standard analyzer | 改用 IK 插件 |
| 评分不合理 | 默认 BM25 不适合业务 | 用 `function_score` 调权 |
| 排序查不到数据 | sort 字段是 text | 改用 keyword/numeric 字段 |

---

**参考**：
- [ES 官方 Query DSL 文档](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html)
- [0040 · IK 中文分词](./0040-elasticsearch-ik-analyzer.md)
- [0042 · 深分页 search_after + PIT](./0042-elasticsearch-search-after-pit.md)
- [0043 · 相关性调优](./0043-elasticsearch-relevance-tuning.md)
