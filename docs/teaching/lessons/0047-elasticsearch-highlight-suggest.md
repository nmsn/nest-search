# 0047 · 高亮 + Suggest：商品目录搜索的 UX 增强

> Phase B' 第 8 课（ES 企业级收官）。让搜索结果**好看好用**：关键词高亮 + 搜索框自动补全。

## 你今天会拿到什么

1. 理解 **highlight（高亮）** 原理和应用
2. 理解 **suggest（搜索建议）** 的两种类型
3. 改 nest-search 查询加 highlight
4. 加 suggest endpoint（搜索框自动补全）
5. 21 测试还过 + 1 个 commit

---

## §1. 业务场景

### 1.1 搜索结果页需要高亮

```
用户搜 "显示器":
  1. 海信 65 寸 4K 商用【显示器】  ← "显示器" 高亮
  2. 三星 55 寸 4K【显示屏】       ← "显示屏" 高亮（被匹配到）
  3. 华为 65 寸 智慧屏

前端: 用 <em> 标签或 CSS 把"显示器"标红
```

### 1.2 搜索框自动补全

```
用户输入 "海" → 立即弹出:
  - 海信 65 寸 4K 商用显示器
  - 海信 43 寸 数字标牌屏
  - 海信 55 寸 触控一体机
  - 海康威视 道闸一体机

前端: <datalist> 或 autocomplete 组件
```

### 1.3 nest-search 需要吗？

```
✅ 高亮: 商品目录搜索几乎必备
  - 告诉用户"为什么这个产品出现在结果里"
  - 提升搜索体验

⚠️ Suggest: 看业务需求
  - 搜索框是必填的常见入口 → 必加
  - 内部管理后台 → 可选
```

---

## §2. Highlight（高亮）

### 2.1 基本用法

```json
{
  "query": { "match": { "name": "显示器" } },
  "highlight": {
    "fields": {
      "name": {
        "pre_tags":  ["<em>"],
        "post_tags": ["</em>"]
      }
    }
  }
}
```

返回：
```json
{
  "hits": {
    "hits": [
      {
        "_source": { "name": "海信 65 寸 4K 商用显示器" },
        "highlight": {
          "name": ["海信 65 寸 4K 商用<em>显示器</em>"]
        }
      }
    ]
  }
}
```

### 2.2 关键参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `pre_tags` | `<em>` | 开始标签 |
| `post_tags` | `</em>` | 结束标签 |
| `number_of_fragments` | 5 | 返回片段数（0=整段）|
| `fragment_size` | 100 | 片段字符数 |
| `require_field_match` | true | 字段必须匹配 query |

### 2.3 整段返回（推荐）

```json
{
  "highlight": {
    "fields": {
      "name": {
        "number_of_fragments": 0  // ← 返回完整字段（不分段）
      }
    }
  }
}
```

返回：
```json
"highlight": {
  "name": ["海信 65 寸 4K 商用<em>显示器</em>"]
}
```

**优点**：完整字段，CSS 样式好处理
**缺点**：字段长时整个返回

### 2.4 多字段高亮

```json
{
  "highlight": {
    "fields": {
      "name": { "pre_tags": ["<b>"], "post_tags": ["</b>"] },
      "spec": { "number_of_fragments": 2, "fragment_size": 50 }
    }
  }
}
```

---

## §3. Suggest（搜索建议）

### 3.1 两种类型

```
1. term suggester（纠错）
   输入: "海新"
   输出: "海信" (因为 "海信" 存在,海新 是拼写错误)

2. completion suggester（自动补全）
   输入: "海"  
   输出: ["海信 65 寸", "海信 43 寸", "海康威视 道闸"]
```

### 3.2 term suggester

```json
POST /products_ds/_search
{
  "suggest": {
    "product_suggest": {
      "text": "海新",          // 用户输入
      "term": {
        "field": "brand",     // 建议从哪个字段
        "suggest_mode": "always"
      }
    }
  }
}
```

返回：
```json
{
  "suggest": {
    "product_suggest": [
      {
        "text": "海新",
        "options": [
          { "text": "海信", "score": 0.75 },
          { "text": "海康威视", "score": 0.6 }
        ]
      }
    ]
  }
}
```

**用途**：拼写纠错
**缺点**：性能较差（每次都扫全字段）

### 3.3 completion suggester

**结构不同**：需要一个独立的 `completion` 字段类型。

#### 3.3.1 mapping 加 completion 字段

```json
PUT /products_ds_v1
{
  "mappings": {
    "properties": {
      "name_suggest": {
        "type": "completion"
      }
    }
  }
}
```

#### 3.3.2 写入时加 suggest 字段

```ts
// bulk write
{ "index": { "_index": "products_ds", "_id": "P001" } }
{ "name": "...", "name_suggest": { "input": ["海信 65 寸 4K 商用显示器", "海信", "65 寸"] } }
```

`input` 是建议列表：一个文档可以有多个输入。

#### 3.3.3 查询建议

```json
POST /products_ds/_search
{
  "_source": false,  // 不需要返回文档
  "suggest": {
    "product_suggest": {
      "prefix": "海信",
      "completion": {
        "field": "name_suggest",
        "size": 10
      }
    }
  }
}
```

返回：
```json
{
  "suggest": {
    "product_suggest": [
      {
        "text": "海信",
        "options": [
          { "text": "海信 65 寸 4K 商用显示器", "_id": "P001" },
          { "text": "海信 43 寸 数字标牌屏", "_id": "P011" }
        ]
      }
    ]
  }
}
```

**优点**：
- 极快（FST 数据结构，毫秒级）
- 支持 prefix/fuzzy/regex
- 客户端可直接用

---

## §4. nest-search 改造

### 4.1 加 highlight（轻量，不需要 mapping 变更）

```ts
// search.queries.ts - buildProductSearchQuery 加 highlight
const body: any = {
  query: { ... },
  size: params.size,
  sort: [...],
  highlight: {
    fields: {
      name: {
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
        number_of_fragments: 0,
      },
      spec: {
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
        number_of_fragments: 0,
      },
    },
  },
};
```

### 4.2 service 返回 highlight

```ts
return {
  total: result.hits.total,
  page: params.page,
  size: params.size,
  items: hits.map((hit: any) => ({
    ...hit._source,
    _highlight: hit.highlight || {},  // 嵌套高亮
  })),
  nextCursor,
};
```

### 4.3 加 suggest endpoint（用 completion 字段）

#### 4.3.1 mapping 加 name_suggest 字段

需要重建索引（0041 教的 alias + reindex 流程）：
```ts
name_suggest: { type: 'completion' }
```

#### 4.3.2 写入时加 suggest

```ts
// sync.consumer.ts
const docWithSuggest = {
  ...docWithPinyin,
  name_suggest: {
    input: [
      doc.name,                    // 完整名
      doc.brand,                   // 品牌
      ...doc.name.split(/\s+/),    // 拆词（"海信 65 寸" → "海信", "65", "寸"）
    ].filter(Boolean),
  },
};
```

#### 4.3.3 新增 suggest endpoint

```ts
// search.controller.ts
@Get('suggest')
async suggest(
  @Param('businessLine') businessLine: string,
  @Query('prefix') prefix: string,
) {
  return this.searchService.suggest(businessLine, prefix);
}
```

```ts
// search.service.ts
async suggest(businessLine: string, prefix: string) {
  const index = this.getIndex(businessLine);
  const result = await this.esService.search(index, {
    _source: false,
    suggest: {
      product_suggest: {
        prefix,
        completion: { field: 'name_suggest', size: 10 },
      },
    },
  });
  return result.suggest.product_suggest[0].options.map((opt: any) => ({
    text: opt.text,
    productId: opt._id,
  }));
}
```

---

## §5. 设计决策

### 决策 1 · highlight 用 pre_tags 还是 CSS？

```
✅ 简单业务: pre_tags/post_tags
   <em>显示器</em> → CSS .em { color: red }

⚠️ 复杂样式: 用 <span class="hl">
   pre_tags: ['<span class="hl">']
```

### 决策 2 · completion suggester vs term suggester

```
completion:
  ✅ 极快
  ❌ 需要专门字段 (mapping 变更)
  ❌ 重建索引才能用

term:
  ✅ 不用改 mapping
  ❌ 性能一般
  ❌ 只支持单词纠错

建议: 已有大量数据 + 想要自动补全 → completion
     偶尔用 + 简单需求 → term
```

### 决策 3 · suggest 字段存什么？

```
商品搜索常见存:
  - 产品名（最高优先级）
  - 品牌（海信/三星）
  - 型号（PM-55F）
  - 常用关键词（"商用"、"4K"）

不存:
  - 完整规格（太长）
  - 描述（变化多）
```

---

## §6. Quiz

**Q1: highlight 中 `number_of_fragments: 0` 的作用？**

A) 不返回结果
B) 返回完整字段而不是片段
C) 不高亮

**Q2: completion suggester 的主要优势？**

A) 不需要改 mapping
B) 极快（FST 数据结构，毫秒级）
C) 支持任意字段

**Q3: nest-search 应该先加 highlight 还是 suggest？**

A) highlight（轻量，UX 提升大）
B) suggest（提升搜索框体验）
C) 两个都先不加

---

## §7. Commit Message

```
feat(search-service): 0047 高亮 + suggest 自动补全

- search.queries.ts: 加 highlight (name + spec)
- search.service.ts: 返回 _highlight 字段
- sync.consumer.ts: 写入时加 name_suggest (completion 字段)
- mapping: 加 name_suggest { type: completion }
- 新增 GET /api/search/:bl/suggest endpoint
- 21 测试还过
```

---

## §8. 跨节链接

- [0046 · 慢查询调优](./0046-elasticsearch-slow-query-tuning.md) — 上一课
- [0048 · 错误处理模式](./0048-error-handling-patterns.md) — 下一课（ES 企业级收官，错误处理启动）
- [search.service.ts](../../apps/search-service/src/search/search.service.ts) — 业务实现
