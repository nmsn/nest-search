# 0043 · Elasticsearch 相关性调优：BM25 + function_score + 多字段权重

> Phase B' 第 4 课。0042 解决了翻页性能，0043 解决**搜索排序问题**：为什么某些结果排在前面？怎么让想要的排更前？

## 你今天会拿到什么

1. 理解 **BM25 评分算法**（ES 默认相关性算法）
2. 学会用 **explain API** 分析排序原因
3. 掌握 **function_score** 自定义评分
4. 掌握 **多字段权重调优**（name^3 / spec / brand）
5. 改 nest-search 查询支持 function_score 加权
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 当前排序

```
用户搜 "显示器":
  1. 海信 65 寸 4K 商用显示器  ← 匹配 name
  2. (其他产品)

用户搜 "65寸":
  1. 华为 65 寸 智慧屏
  2. 海信 65 寸 4K 商用显示器
  3. MAXHUB 75 寸 会议平板  ← 为什么不排最前？75寸不是65寸
```

**问题**：默认 BM25 只看词频（TF），不看业务价值。

### 1.2 业务想要的排序

```
搜 "65寸":
  1. 海信 65 寸 4K 商用显示器  ← 库存多(50台) → 加权重
  2. 华为 65 寸 智慧屏         ← 库存多(22台) → 加权重
  3. MAXHUB 75 寸 会议平板     ← 不匹配 65寸 → 排在后面

搜 "显示器":
  1. 三星 55 寸 4K 显示屏      ← 品牌知名度高? 利润率更高?
  2. 海信 65 寸 4K 商用显示器
  3. LG 49 寸 拼接屏单元

业务规则: 库存越多的产品越靠前(有货优先)
          特定分类/品牌加权
          价格区间加权(利润高的优先)
```

---

## §2. BM25 评分算法

### 2.1 什么是 BM25？

```
BM25 = Best Matching 25
ES 默认的相似度算法（替换了 TF/IDF）
```

### 2.2 四个核心因素

```
score = 词频(TF) × 逆文档频率(IDF) × 字段长度归一化

1. 词频 TF:  关键词在文档里出现次数越高分越高(但非线性,有上限)
2. IDF:      关键词越"稀有"分越高(显示器 vs 海信)
3. 字段长度:  短字段匹配权重大(名字匹配 > 正文匹配)
4. 参数 k1,b: 控制 TF 和长度归一化的敏感度(默认 k1=1.2, b=0.75)
```

### 2.3 explain API 看评分

```bash
# 搜产品,看为什么这个排第一
GET /products_ds/_explain/P001
{
  "query": { "match": { "name": "显示器" } }
}
```

返回：

```json
{
  "_explanation": {
    "value": 2.07,
    "description": "weight(name:显示器 in doc), product of:",
    "details": [
      { "description": "score(freq=1.0), computed as boost * idf * tf", "value": 2.07 },
      { "description": "idf, computed as log(1 + N - n + 0.5) / (n + 0.5)", "value": 1.5 },
      { "description": "tf, computed as freq / (freq + k1 * (1 - b + b * dl / avgdl))", "value": 1.38 }
    ]
  }
}
```

**可以分析**：
- `freq`：关键词在该文档中出现次数
- `idf`：逆文档频率（值越大说明词越稀有）
- `tf`：词频（受 k1 和 b 影响）

---

## §3. function_score

### 3.1 原理

```
标准 BM25 评分:
  _score = BM25(query, doc)

function_score 评分:
  _score = BM25(query, doc) × function1 × function2 × ...

在 BM25 基础上叠加业务规则
```

### 3.2 常见函数

| 函数 | 用途 | 示例 |
|------|------|------|
| `weight` | 固定权重 | category=商显 加权 2x |
| `field_value_factor` | 字段值算分 | stock 越多分越高 |
| `script_score` | 任意脚本 | price × stock 自定义 |
| `random_score` | 随机排序 | 打乱结果 |

### 3.3 field_value_factor

```json
{
  "query": {
    "function_score": {
      "query": { "match": { "name": "显示器" } },
      "field_value_factor": {
        "field": "stock",
        "modifier": "log1p",    // log(1 + stock) 避免单条太高
        "missing": 0
      },
      "boost_mode": "multiply"  // BM25 分 × stock 分
    }
  }
}
```

**modifier 对比**：

| modifier | 公式 | 效果 |
|----------|------|------|
| `none` | stock | stock=0 时直接归零(不推荐) |
| `log1p` | log(1 + stock) | stock 越多分越高,但收益递减 |
| `sqrt` | sqrt(stock) | 类似 log,但增长快一点 |
| `square` | stock² | 差距拉大(高风险) |

### 3.4 多个函数组合

```json
{
  "query": {
    "function_score": {
      "query": { "match": { "name": "显示器" } },
      "functions": [
        // 有货优先: 库存正相关
        {
          "field_value_factor": {
            "field": "stock",
            "modifier": "log1p",
            "missing": 0
          }
        },
        // 品牌加权: 三星/Sony 加权
        {
          "filter": { "terms": { "brand": ["三星", "索尼", "LG"] } },
          "weight": 1.5
        }
      ],
      "score_mode": "sum",      // 多函数结果加起来
      "boost_mode": "multiply"  // 再乘 BM25 分
    }
  }
}
```

**score_mode vs boost_mode**：

```
score_mode: functions 数组内的函数如何合并
  - multiply: 所有函数乘积（默认）
  - sum: 所有函数和
  - avg: 平均
  - max: 取最高
  - first: 取第一个非零

boost_mode: 合并后的 function_score 如何与 query 的 BM25 分合并
  - multiply: function × BM25（默认）
  - sum: function + BM25
  - replace: 只用 function，忽略 BM25
  - avg: 平均
```

---

## §4. nest-search 改造

### 4.1 当前查询（search.queries.ts）

```ts
// 只有 multi_match
multi_match: { query: keyword, fields: ['name^3', 'spec', 'brand', 'model'] }
```

### 4.2 改造后

```ts
// 加 function_score: 库存越多越靠前
const query = {
  function_score: {
    query: { /* 原来的 bool 查询 */ },
    field_value_factor: {
      field: 'stock',
      modifier: 'log1p',
      missing: 0,
    },
    boost_mode: 'multiply',
  },
};
```

---

## §5. 设计决策

### 决策 1 · 用什么 function？

```
nest-search 场景:
  stock > 0 优先展示(有货)
  品牌加权(特定品牌权重)
  price 区间加权(高利润产品)

最简单的: field_value_factor(stock)
  产品丰富度排序: 库存多 = 主力产品 = 优先展示
```

### 决策 2 · score_mode 怎么配？

```
单函数场景 → 不需要 score_mode
多函数场景 → sum(各因素独立加权重) 或 multiply(各因素乘积)
```

### 决策 3 · 用 explain API 调参？

```
建议:
  1. 先用 explain 看 BM25 基础分
  2. 加 function_score 调一版
  3. 再 explain 对比前后分数
  4. 直到业务方满意排序

ES 没有"调参自动最优",只有业务验证。
```

---

## §6. Quiz

**Q1: BM25 的 scoe 主要受哪几个因素影响？**

A) 词频、逆文档频率、字段长度
B) 文档大小、索引大小
C) 只有词频

**Q2: function_score 的 `field_value_factor` 适合什么场景？**

A) 根据字段值动态加权，如库存越多越靠前
B) 给多字段设置权重
C) 模糊匹配

**Q3: `boost_mode: "replace"` 的含义是什么？**

A) 用 BM25 分数替换 function_score
B) 用 function_score 分数完全替代 BM25 分数，忽略 query 相关性
C) 替换整个查询

---

## §7. Commit Message

```
feat(search-service): 0043 相关性调优 function_score

- search.queries.ts: buildProductSearchQuery 加 function_score
  根据 stock(库存) 加权,有货优先展示
- 21 测试还过
```

---

## §8. 跨节链接

- [0042 · 深度分页](./0042-elasticsearch-search-after-pit.md) — 上一课
- [0044 · 聚合分析实战](./0044-elasticsearch-aggregations.md) — 下一课
- [search.queries.ts](../../apps/search-service/src/search/search.queries.ts) — 查询实现
