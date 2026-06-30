# 0043 · ES 搜索调优：用 explain API 排查"搜不到/搜不准"

> Phase B' 第 4 课。聚焦你的实际需求：**搜不到某个产品时怎么排查**。

## 你今天会拿到什么

1. 理解 **BM25 评分**的基本概念（知道 explain 输出在说什么）
2. 学会 **explain API** 诊断为什么某产品搜不到/搜不准
3. 学会 **精确匹配 vs 分词搜索**的边界
4. 不改造代码，但保留排查能力
5. 21 测试还过 + 1 个 commit

---

## §1. 业务场景

```
场景 A: 搜"65寸"搜不到预期的产品？
  产品名是 "65 寸"（带空格），用户搜 "65寸"（无空格）
  因为 ES 分词拆成 ["65", "寸"]，用户搜索词被拆成 ["65寸"]

场景 B: 搜"海信"只出来 2 条海信产品？
  发现还有 1 条海信产品没搜到
  因为它被过滤条件排除在外

场景 C: categoryId=1001 搜不到？
  categoryId 是 int 字段，用户传了 "1001"（字符串）
  ES 类型不匹配，被忽略
```

**核心工具**：用 `_explain` 和 `_profile` 查原因。

---

## §2. BM25 评分快速入门

ES 默认的评分算法 BM25（不是搜索引擎的"魔法"，而是数学公式）：

```
score = 词频(TF) × 逆文档频率(IDF) × 字段长度归一化

TF:  这个产品里"关键词"出现了几次？越多分越高
IDF: 这个"关键词"在所有产品里常见吗？越稀有分越高
字段长度: name 长一点还是短一点？短字段命中权重大
```

**对你的业务**：BM25 基本不直接影响"搜不到"的问题。但 explain API 能告诉你**为什么某产品分低/没匹配**。

---

## §3. explain API 实战

### 3.1 基本用法

```bash
GET /products_ds/_explain/P001
{
  "query": {
    "match": { "name": "显示器" }
  }
}
```

### 3.2 返回内容解读

```json
{
  "_index": "products_ds_v1",
  "_id": "P001",
  "matched": true,
  "_explanation": {
    "value": 2.07,
    "description": "weight(name:显示器 in doc)",
    "details": [
      {
        "description": "score(doc=1), product of:",
        "value": 2.07,
        "details": [
          { "description": "idf, computed as ...", "value": 1.5 },
          { "description": "tf, freq=1", "value": 1.38 }
        ]
      }
    ]
  }
}
```

**怎么看**：
| 字段 | 含义 | 排查线索 |
|------|------|----------|
| `matched: true/false` | 是否匹配到 | false = 完全没命中 |
| `description` | 评分描述 | 显示用了哪个字段 |
| `details[].idf` | 逆文档频率 | 太低说明该词太常见 |
| `details[].tf` | 词频 | 该文档匹配次数 |

### 3.3 排查"搜不到"

```bash
# 1. 搜"海信"发现只出来 2 条，但你知道有 3 条海信产品
# → 用 explain 看第 3 条为什么没匹配到

GET /products_ds/_explain/P030
{
  "query": {
    "match": { "name": "海信" }
  }
}

# 返回 matched: true → 其实是搜到的
# 只是排在第 3 页后面了（BM25 分低）
```

```bash
# 2. 真的没搜到 → matched: false
# 原因可能是：
#   a) 关键词不在 name 字段里（在 spec 里）
#   b) 分词不一致（"65寸" vs "65 寸"）
#   c) 字段类型不对（keyword 字段用 match 查不到）
```

---

## §4. 常见问题排查

### 4.1 "65寸"（无空格）搜不到"65 寸"（有空格）

```bash
# 用 _analyze 看分词结果
POST /_analyze
{
  "analyzer": "ik_smart",
  "text": "65寸"
}
# → ["65寸"]

POST /_analyze
{
  "analyzer": "ik_smart",
  "text": "65 寸"
}
# → ["65", "寸"]
```

**解决**：IK 把"65寸"当整体，"65 寸"拆成两个。用 IK 搜索 "65寸" 时匹配不到 "65 寸" 的产品。

```bash
# 解决方法：搜的时候两边都试，或者用 match 自动带空格
# 用户搜"65寸"，ES 在索引时已经在 name 里存了 "65" + "寸" 两个 term
# 但搜索词 "65寸" 被 ik_smart 解析为 ["65寸"]，没有拆开
# → 可以专门加一个字段存无空格的 name 用于搜索
```

### 4.2 keyword 字段用 match 搜不到

```bash
# ❌ 错误：category 是 keyword 类型
GET /products_ds/_search
{ "query": { "match": { "category": "商显" } } }

# ✅ 正确：keyword 用 term
GET /products_ds/_search
{ "query": { "term": { "category": "商显" } } }
```

### 4.3 categoryId 传错类型

```bash
# ❌ 错误：categoryId 是 integer，传了字符串
{ "term": { "categoryId": "1001" } }

# ✅ 正确：传数字
{ "term": { "categoryId": 1001 } }
```

---

## §5. 多字段权重已内置（不改代码）

nest-search 当前的 `search.queries.ts` 已经配置好了：

```ts
multi_match: {
  query: '显示器',
  fields: ['name^3', 'spec', 'brand', 'model'],
  // name^3：name 命中的权重 x3
  // spec/brand/model：权重 1
}
```

这种配置已经是**合理的商品目录搜索**做法。不需要改。

---

## §6. 开发新搜索时遵循的原则

```
1. 先确认字段类型
   GET /products_ds/_mapping → 看字段是 keyword / text / integer

2. 区分精确搜索和全文搜索
   分类/品牌/目录 → term / terms（keyword 字段）
   产品名/规格 → match / multi_match（text 字段）
   价格/库存 → range（numeric 字段）

3. 遇到搜不到 → explain API 查
   看 matched 是否 true
   看 description 说匹配到哪个字段

4. 需要调权重 → 改 fields 值
   name^5 提高 name 权重
   spec^0.5 降低 spec 权重
```

---

## §7. Quiz

**Q1: 搜不到某个产品时，应该先用哪个 API 排查？**

A) `GET _cluster/health`（集群健康）
B) `GET /index/_explain/id { query }`（查看为什么没匹配）
C) `GET /index/_stats`（索引统计）

**Q2: `matched: false` 在 explain 结果中表示什么？**

A) 索引不存在
B) 该文档没有匹配到查询条件
C) 查询语法错误

**Q3: ES 中 keyword 字段应该用什么查询？**

A) `match`
B) `term`
C) `range`

---

## §8. Commit Message

```
docs(teaching): 0043 ES explain API 搜索排查 lesson
```

---

## §9. 跨节链接

- [0042 · 深度分页](./0042-elasticsearch-search-after-pit.md) — 上一课
- [0044 · 聚合实战](./0044-elasticsearch-aggregations.md) — 下一课
- [search.queries.ts](../../apps/search-service/src/search/search.queries.ts) — 当前查询代码
- [elasticsearch-query-dsl-cheatsheet.md](../reference/elasticsearch-query-dsl-cheatsheet.md) — Query DSL 速查
