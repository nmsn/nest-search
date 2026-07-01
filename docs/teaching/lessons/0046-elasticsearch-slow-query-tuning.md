# 0046 · Elasticsearch 慢查询调优：Profile API + slowlog + query 改写

> Phase B' 第 7 课。生产环境搜索变慢怎么办？本节讲**怎么定位慢查询**和**怎么改写**让它变快。

## 你今天会拿到什么

1. 理解 **慢查询的常见原因**
2. 学会 **Profile API** 看查询时间分解
3. 学会 **slowlog 配置** 记录慢查询
4. 学会 **query 改写** 常见 5 种优化
5. nest-search 加一个慢查询中间件（演示用）
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 生产环境症状

```
"搜索变慢了"
"ES 集群 CPU 飙到 90%"
"用户点搜索 30 秒才返回"
```

**第一步**：先找到"哪个查询慢" → 用 Profile API
**第二步**：找到"为什么慢" → 分析 Profile 结果
**第三步**：改写查询

---

## §2. 慢查询的常见原因

### 2.1 5 个常见原因

| 原因 | 症状 | 解决 |
|------|------|------|
| 1. **深分页 from+size** | 大 from 时线性慢 | 改 search_after |
| 2. **wildcard 模糊查询** | `*keyword*` 全扫 | 改 ngram |
| 3. **过多聚合桶数** | terms size=10000 | 改 size=10 |
| 4. **字段未索引** | text 字段用 term 查 | 改 mapping |
| 5. **大脚本查询** | script_score 慢 | 改 field_value_factor |

### 2.2 nest-search 常见场景

```
场景 1: 聚合 size 太大
  aggs: { brands: { terms: { size: 1000 } } }
  → ES 内部要统计 1000 个桶,慢

场景 2: 商品目录搜索的 query 不高效
  → 改用 filter 替代 query (filter 不评分,可缓存)

场景 3: 多字段 multi_match 字段太多
  fields: [name, spec, brand, model, desc, imageUrl]
  → 只保留 name^3 / spec / brand
```

---

## §3. Profile API

### 3.0 是什么？

```
Profile API = ES 内置的"查询分析工具"
作用: 看每个查询的**执行时间分解**（纳秒级）
用法: 在任何 _search 请求里加 "profile": true
```

**类比**：默认 `_search` 像快递面单只显示"已签收 12ms"。Profile 像打开包装，看每个子件用了多少时间。

### 3.1 基本用法

```bash
GET /products_ds/_search
{
  "profile": true,
  "query": {
    "bool": {
      "must": [{ "match": { "name": "显示器" } }],
      "filter": [{ "term": { "categoryId": 1001 } }]
    }
  }
}
```

### 3.2 关键字段

| 字段 | 含义 |
|------|------|
| `type` | 查询类型（BooleanQuery / MatchQuery / TermQuery / PointRangeQuery 等）|
| `description` | 字段名+值（直观显示在查什么）|
| `time_in_nanos` | 这个子查询耗时（**纳秒**）|
| `breakdown` | 详细时间分解（评分/匹配/构建）|
| `children` | 子查询（嵌套结构）|

### 3.3 nest-search 实战 demo

```bash
POST /products_ds/_search
{
  "profile": true,
  "size": 0,
  "query": {
    "bool": {
      "must": [{ "match": { "name": "显示器" } }],
      "filter": [
        { "term": { "categoryId": 1001 } },
        { "range": { "price": { "gte": 1000, "lte": 10000 } } }
      ]
    }
  }
}
```

实际返回（简化）：
```json
{
  "took": 22,
  "profile": {
    "shards": [{
      "searches": [{
        "query": [{
          "type": "BooleanQuery",
          "time_in_nanos": 2370000,
          "children": [
            { "type": "TermQuery", "description": "name:显示器", "time_in_nanos": 400000 },
            { "type": "PointRangeQuery", "description": "categoryId:1001", "time_in_nanos": 990000 },
            { "type": "IndexOrDocValuesQuery", "description": "price:[1000, 10000]", "time_in_nanos": 110000 }
          ]
        }]
      }]
    }]
  }
}
```

**观察**：
- `PointRangeQuery` 和 `IndexOrDocValuesQuery` 都是 filter 走的，**不评分** → 快
- `TermQuery` 是 must 走的，**参与评分** → 慢一些
- 整体 22ms 主要是网络开销，节点执行只 2.61ms

### 3.4 Profile vs Explain 区别

| 工具 | 作用 | 输出 |
|------|------|------|
| **Profile** | 看**执行时间**分解 | 纳秒级时间统计 |
| **Explain** | 看**评分细节** | BM25 评分公式明细 |

```bash
# Explain: 看 BM25 评分
GET /products_ds/_explain/P001
{ "query": { "match": { "name": "显示器" } } }

# Profile: 看查询耗时
POST /products_ds/_search
{ "profile": true, "query": {...} }
```

### 3.5 返回结果（完整）

```json
{
  "took": 12,
  "profile": {
    "shards": [
      {
        "searches": [
          {
            "query": [{
              "type": "BooleanQuery",
              "time_in_nanos": 50000,
              "breakdown": {
                "score": 30000,
                "match_count": 0,
                "build_scorer_count": 1
              },
              "children": [
                {
                  "type": "TermQuery",
                  "description": "categoryId:1001",
                  "time_in_nanos": 10000
                },
                {
                  "type": "MatchQuery",
                  "description": "name:显示器",
                  "time_in_nanos": 20000
                }
              ]
            }]
          }
        ]
      }
    ]
  }
}
```

### 3.3 怎么看

| 字段 | 含义 |
|------|------|
| `took` | 总耗时（ms）|
| `time_in_nanos` | 子查询耗时（纳秒）|
| `breakdown.score` | 评分耗时（filter 不会有）|
| `build_scorer_count` | 构建评分器的次数 |

**排查方法**：
- 找到 `time_in_nanos` 最大的子查询
- 看它的 description（哪种查询类型）
- 决定怎么改写

### 3.4 实战：诊断 `multi_match` 慢

```json
{
  "type": "MultiTermQueryWrapper",
  "description": "name^3,spec,brand,model",
  "time_in_nanos": 200000
}
```

`time_in_nanos: 200000` (0.2ms) 算慢吗？
- 单次查询 < 50ms = 快
- 单次查询 50-200ms = 中等
- 单次查询 > 200ms = 慢

**优化方向**：
- 减少 fields 数量
- 用 `best_fields` 模式（默认）
- 把耗时长的字段（spec）权重降低

---

## §4. Slowlog 配置

### 4.1 集群级 slowlog

```bash
PUT /products_ds/_settings
{
  "index.search.slowlog.threshold.query.warn": "10s",
  "index.search.slowlog.threshold.query.info": "5s",
  "index.search.slowlog.threshold.query.debug": "2s",
  "index.search.slowlog.threshold.query.trace": "500ms",
  "index.search.slowlog.threshold.fetch.warn": "1s",
  "index.search.slowlog.level": "INFO"
}
```

**含义**：
- 查询超过 10s 记录 warn 日志
- 查询超过 5s 记录 info
- 查询超过 2s 记录 debug
- 查询超过 500ms 记录 trace

### 4.2 日志位置

```bash
# ES 容器内
docker exec nest-search-es tail -f /usr/share/elasticsearch/logs/nest-search-es_index_search_slowlog.log
```

输出示例：
```
[2026-06-30T10:00:00,000][INFO ][index.search.slowlog.query] [node-1] took[12.3s], took_millis[12300],
  total_hits[50000], types[], stats[], search_type[QUERY_THEN_FETCH],
  total_shards[1], shards[{"id":"0","took":12300,"timed_out":false,"searches":[{"query":...}]}],
  source[{"query":{...}}]
```

### 4.3 实战：根据 slowlog 找到慢查询

```bash
# 1. 查 slowlog 日志
grep "took_millis" logs/*slowlog* | sort -t'[' -k2 -r | head -20

# 2. 找到 top 20 慢查询

# 3. 对每个慢查询用 Profile API 分析

# 4. 改写
```

---

## §5. 5 种常见 query 改写

### 5.1 query → filter

```ts
// ❌ 慢：query 参与评分
{ "match": { "name": "显示器" } }  // 默认 OR + 评分

// ✅ 快：filter 不评分,可缓存
{ "bool": {
  "filter": [
    { "term": { "categoryId": 1001 } },  // 精确值用 filter
    { "range": { "price": { "gte": 1000, "lte": 5000 } } }  // 范围用 filter
  ]
} }
```

### 5.2 wildcard 全文

```ts
// ❌ 慢：前缀 *
{ "wildcard": { "name": "*显示器*" } }

// ✅ 快：分词后倒排
{ "match": { "name": "显示器" } }
```

### 5.3 减少 fields 数量

```ts
// ❌ 慢：多字段（5+）
multi_match: { fields: ['name^3', 'spec', 'brand', 'model', 'desc', 'imageUrl'] }

// ✅ 快：只 3-4 个核心字段
multi_match: { fields: ['name^3', 'spec', 'brand'] }
```

### 5.4 限制聚合 size

```ts
// ❌ 慢：size 1000
aggs: { brands: { terms: { size: 1000 } } }

// ✅ 快：size 20（前端展示用不到 1000）
aggs: { brands: { terms: { size: 20 } } }
```

### 5.5 composite 替代 size 大的分页

```ts
// ❌ 慢：terms + size 10000
aggs: { buckets: { terms: { field: "category", size: 10000 } } }

// ✅ 快：composite + after_key 分页
aggs: { buckets: { composite: {
  size: 1000,
  sources: [{ category: { terms: { field: "category" } } }]
} } }
```

---

## §6. nest-search 中间件（演示用）

### 6.1 加一个慢查询监控中间件

```ts
// apps/search-service/src/middleware/slow-query.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@Injectable()
export class SlowQueryMiddleware implements NestMiddleware {
  constructor(private esService: ElasticsearchService) {}

  async use(req: any, res: any, next: () => void) {
    const start = Date.now();
    // 拦截 search 响应
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const duration = Date.now() - start;
      if (duration > 200) {
        console.warn(`[ES SlowQuery] ${duration}ms:`, JSON.stringify({
          took: body.took,
          total: body.hits?.total?.value,
          url: req.url,
        }));
      }
      return originalJson(body);
    };
    next();
  }
}
```

### 6.2 在 AppModule 注册

```ts
// apps/search-service/src/app.module.ts
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { SlowQueryMiddleware } from './middleware/slow-query.middleware';

export class AppModule implements NestModule, OnModuleInit {
  // ... 现有代码

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SlowQueryMiddleware).forRoutes('api/search/*');
  }
}
```

**说明**：这只是个**演示**，生产环境应该用 ES 自带的 slowlog。

---

## §7. 设计决策

### 决策 1 · 用 Profile 还是 slowlog？

```
开发调试:  Profile API（实时分析）
生产监控:  slowlog（自动记录）
两者结合:  slowlog 标记可疑查询 → Profile 深度分析
```

### 决策 2 · 慢查询阈值多少？

```
按业务:
  P99 < 100ms: 优秀
  P99 < 500ms: 可接受
  P99 > 1000ms: 需优化

nest-search: 目标 P99 < 200ms（聚合可能要 500ms）
```

---

## §8. Quiz

**Q1: 怎么定位慢查询？**

A) Profile API
B) slowlog 配置
C) 两者结合
D) 看 log4j

**Q2: filter 相比 query 有什么优势？**

A) 功能更强
B) 不参与评分，可缓存，性能更好
C) 支持模糊匹配

**Q3: wildcard `*keyword*` 有什么问题？**

A) 没结果
B) 全表扫描，性能差
C) 只匹配英文

---

## §9. Commit Message

```
feat(search-service): 0046 慢查询监控 + 演示中间件

- middleware/slow-query.middleware.ts: 监控 /api/search 慢查询
- app.module.ts: 注册中间件
- 21 测试还过
```

---

## §10. 跨节链接

- [0045 · ILM](./0045-elasticsearch-ilm-rollover.md) — 上一课
- [0047 · 高亮 + Suggest](./0047-elasticsearch-highlight-suggest.md) — 下一课
- [search.service.ts](../../apps/search-service/src/search/search.service.ts) — 业务查询实现
