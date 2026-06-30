# 0044 · Elasticsearch 聚合实战：商品目录筛选 + 价格区间

> Phase B' 第 5 课。商品目录检索的**核心功能**：前端分类、品牌、价格筛选条件 + 每个选项的统计数。

## 你今天会拿到什么

1. 理解 **聚合（Aggregation）** 是什么
2. 掌握 **terms agg**（按字段分桶）— 目录/品牌统计
3. 掌握 **range agg**（按区间分桶）— 价格区间
4. 掌握 **stats agg**（数值统计）— 价格 min/max/avg
5. 改 nest-search `/aggregations` endpoint
6. 21 测试还过 + 1 个 commit

---

## §1. 业务场景

### 1.1 商品目录页需要什么数据？

```
前端请求 /api/search/ds/aggregations

返回:
{
  "categories": [
    { "key": "商显", "doc_count": 15 },
    { "key": "道闸", "doc_count": 0 }
  ],
  "categoryIds": [
    { "key": 1001, "name": "商用显示屏", "doc_count": 4 },
    { "key": 1002, "name": "广告机", "doc_count": 2 },
    { "key": 1003, "name": "拼接屏", "doc_count": 2 },
    { "key": 1004, "name": "教学一体机", "doc_count": 3 },
    { "key": 1005, "name": "数字标牌", "doc_count": 3 },
    { "key": 1006, "name": "触控一体机", "doc_count": 1 }
  ],
  "brands": [
    { "key": "海信", "doc_count": 4 },
    { "key": "创维", "doc_count": 2 }
  ],
  "priceStats": {
    "min": 1599,
    "max": 22999,
    "avg": 8500
  },
  "priceRanges": [
    { "key": "0-2000", "doc_count": 1 },
    { "key": "2000-5000", "doc_count": 6 },
    { "key": "5000-10000", "doc_count": 6 },
    { "key": "10000+", "doc_count": 7 }
  ]
}
```

前端展示：左侧筛选栏，括号里显示每个选项的产品数。

---

## §2. 聚合基础

### 2.1 三种聚合类型

| 类型 | 用途 | 示例 |
|------|------|------|
| **Bucket（桶）** | 把数据分组 | 按品牌分组 |
| **Metric（指标）** | 计算数值 | 价格 avg/min/max |
| **Pipeline（管道）** | 对聚合结果再聚合 | 二次筛选 |

### 2.2 关键参数

```json
{
  "size": 0,           // 不返回文档,只返回聚合结果
  "aggs": {
    "agg_name": {       // 自定义名字,前端会用到
      "type": "...",
      "field": "...",
      "size": 10         // 桶数限制
    }
  }
}
```

---

## §3. terms agg（按字段分桶）

```json
{
  "size": 0,
  "aggs": {
    "by_brand": {
      "terms": { "field": "brand", "size": 50 }
    }
  }
}
```

返回：
```json
{
  "aggregations": {
    "by_brand": {
      "buckets": [
        { "key": "海信", "doc_count": 4 },
        { "key": "创维", "doc_count": 2 }
      ]
    }
  }
}
```

**关键参数**：
| 参数 | 用途 |
|------|------|
| `field` | 聚合字段（必须是 keyword / integer / 不分词的字段）|
| `size` | 桶数（默认 10）|
| `order` | 排序（`{"_count": "desc"}` 或 `{"_key": "asc"}`）|
| `min_doc_count` | 过滤掉小桶 |

---

## §4. range agg（区间分桶）

### 价格区间示例

```json
{
  "size": 0,
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          { "key": "0-2000", "to": 2000 },
          { "key": "2000-5000", "from": 2000, "to": 5000 },
          { "key": "5000-10000", "from": 5000, "to": 10000 },
          { "key": "10000+", "from": 10000 }
        ]
      }
    }
  }
}
```

返回：
```json
{
  "price_ranges": {
    "buckets": [
      { "key": "0-2000", "from": null, "to": 2000, "doc_count": 1 },
      { "key": "2000-5000", "from": 2000, "to": 5000, "doc_count": 6 },
      { "key": "5000-10000", "from": 5000, "to": 10000, "doc_count": 6 },
      { "key": "10000+", "from": 10000, "to": null, "doc_count": 7 }
    ]
  }
}
```

---

## §5. stats agg（统计值）

```json
{
  "size": 0,
  "aggs": {
    "price_stats": {
      "stats": { "field": "price" }
    }
  }
}
```

返回：
```json
{
  "price_stats": {
    "count": 30,
    "min": 1599,
    "max": 22999,
    "avg": 8500,
    "sum": 255000
  }
}
```

**其他指标**：
| 名字 | 返回 |
|------|------|
| `min` / `max` | 单个值 |
| `avg` | 平均值 |
| `sum` | 总和 |
| `stats` | 上面 4 个都有 |
| `extended_stats` | 含方差、标准差 |

---

## §6. nest-search 改造

### 6.1 现状

```ts
// search.queries.ts - 已有
export function buildAggregationQuery() {
  return {
    size: 0,
    aggs: {
      categories: { terms: { field: 'category', size: 50 } },
      brands: { terms: { field: 'brand', size: 50 } },
      price_stats: { stats: { field: 'price' } },
    },
  };
}
```

### 6.2 改造：加 categoryIds 子目录 + 价格区间

```ts
export function buildAggregationQuery() {
  return {
    size: 0,
    aggs: {
      // 一级分类
      categories: {
        terms: { field: 'category', size: 50 },
      },
      // 子目录（按 categoryId 聚合 + 升序）
      categoryIds: {
        terms: { field: 'categoryId', size: 50, order: { _key: 'asc' } },
      },
      // 品牌
      brands: {
        terms: { field: 'brand', size: 50 },
      },
      // 价格统计
      price_stats: {
        stats: { field: 'price' },
      },
      // 价格区间
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: '0-2000', to: 2000 },
            { key: '2000-5000', from: 2000, to: 5000 },
            { key: '5000-10000', from: 5000, to: 10000 },
            { key: '10000+', from: 10000 },
          ],
        },
      },
    },
  };
}
```

### 6.3 service 加目录名映射

```ts
// search.service.ts
private readonly CATEGORY_NAME_MAP: Record<number, string> = {
  1001: '商用显示屏', 1002: '广告机', 1003: '拼接屏',
  1004: '教学一体机', 1005: '数字标牌', 1006: '触控一体机',
  2001: '智能道闸', 2002: '道闸配件', 2003: '广告道闸',
  2004: '高速道闸', 2005: '升降柱',
  3001: '会议平板', 3002: '智能交互平板',
};

async getAggregations(businessLine: string) {
  const result = await this.esService.search(index, query);
  return {
    categories: result.aggregations.categories.buckets,
    categoryIds: result.aggregations.categoryIds.buckets.map((b: any) => ({
      id: b.key,
      name: this.CATEGORY_NAME_MAP[b.key] || '未分类',
      count: b.doc_count,
    })),
    brands: result.aggregations.brands.buckets,
    priceStats: result.aggregations.price_stats,
    priceRanges: result.aggregations.price_ranges.buckets,
  };
}
```

---

## §7. 设计决策

### 决策 1 · size: 0 必须设

```
size: 0 → 不返回 hits，只返回 aggregations
→ 节省带宽（如果有 1000 条数据,不返回 _source）
```

### 决策 2 · categoryId 用 integer 不用 keyword？

```
integer:
  ✅ 节省空间（4 字节 vs keyword 平均 10-30 字节）
  ✅ 数值范围查询
  ❌ 聚合时返回的是数字,前端需映射成名字

keyword (如 "cat_1001"):
  ✅ 字符串,直观
  ❌ 占空间
```

**nest-search 选 integer**（目录 ID 天然是数字）。

### 决策 3 · 价格区间怎么定？

```
按业务分:
  1000 以下: 入门/低利润
  1000-3000: 主流
  3000-10000: 中高端
  10000+: 高端
  → 看产品实际价格分布,动态调整
```

---

## §8. Quiz

**Q1: terms agg 适合什么场景？**

A) 计算价格平均
B) 按字段分桶统计数量（按品牌统计）
C) 模糊匹配

**Q2: range agg 和 terms agg 的区别？**

A) range 是按区间分桶，terms 是按精确值分桶
B) 一样
C) range 用于数字，terms 用于字符串

**Q3: 聚合查询中 size: 0 的作用？**

A) 返回 0 条结果
B) 不返回 hits 文档，只返回 aggregations
C) 性能更差

---

## §9. Commit Message

```
feat(search-service): 0044 聚合加 categoryId 子目录 + 价格区间

- search.queries.ts: buildAggregationQuery 加 categoryIds/price_ranges
- search.service.ts: 加 CATEGORY_NAME_MAP 映射
- 21 测试还过
```

---

## §10. 跨节链接

- [0043 · explain API 排查](./0043-elasticsearch-explain-debug.md) — 上一课
- [0045 · 索引生命周期](./0045-elasticsearch-ilm-rollover.md) — 下一课
- [search.queries.ts](../../apps/search-service/src/search/search.queries.ts) — 当前实现
