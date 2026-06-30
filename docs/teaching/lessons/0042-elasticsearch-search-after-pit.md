# 0042 · Elasticsearch 深度分页：search_after + PIT

> Phase B' 第 3 课。0038 讲了 from/size 分页，本节**解决前端无限滚动翻页的性能问题**。

## 你今天会拿到什么

1. 理解 **from/size 深分页为什么慢**（10000 条限制）
2. 掌握 **search_after** 游标分页
3. 掌握 **PIT（Point In Time）** 一致性快照
4. 改 nest-search 查询支持 search_after
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 前端无限滚动的痛点

```
前端场景：
  用户浏览商显产品 → 滚动 → 加载更多 → 再滚动 → ...

  第 1 页: from=0, size=20   → 搜 20 条
  第 10 页: from=180, size=20 → 搜 200 条
  第 100 页: from=1980, size=20 → 搜 2000 条
  第 500 页: from=9980, size=20 → 搜 10000 条
  
  ❌ 超过了！报错→前端页面挂掉
```

### 1.2 from/size 为什么慢？

```
ES 内部:
  from=500, size=20
  → 需要从每个 shard 取 520 条数据
  → 在 Coordinator 节点合并排序
  → 丢弃前 500 条
  → 只返回 20 条

  越往后越浪费！
  from 增大 → 查询数据量线性增长 → 超时/报错
```

### 1.3 硬限制

```
ES 默认 max_result_window = 10000
from + size > 10000 → 报错

即使改了配置（10000→100000）:
  第 5000 页时查询 100000 条数据丢 99980 条
  带宽 + 内存 + 耗时都受不了
```

---

## §2. search_after 原理

### 2.1 核心思路

```
from/size：每次都从头扫（效率低）
search_after：从上一页最后一条开始（链表跳转）
```

### 2.2 类比

```
列表翻页：
  from/size = 扫描前 N 页再取一页（O(n)）
  search_after = 记住上一页光标，直接跳到下一页（O(1)）

类比 Linkedin 朋友圈：
  from/size = 每次从前一年的帖子开始翻
  search_after = 从上次看到的位置继续
```

### 2.3 使用方式

```json
// 第 1 页（不需要 search_after）
{
  "size": 20,
  "sort": [
    { "price": "asc" },
    { "_id": "asc" }    // ← 必须有 _id 兜底（唯一性保证不跳数据）
  ]
}

// 第 2 页（传上一页最后一条的 sort 值）
{
  "size": 20,
  "sort": [
    { "price": "asc" },
    { "_id": "asc" }
  ],
  "search_after": [3999, "P001"]  // ← 从这条之后
}

// 第 3 页
{
  "size": 20,
  "sort": [
    { "price": "asc" },
    { "_id": "asc" }
  ],
  "search_after": [4999, "P015"]  // 第 2 页最后一条
}
```

**关键**：`search_after` 的值来自**上一页最后一条的 sort 字段**。

---

## §3. PIT（Point In Time）

### 3.1 为什么需要 PIT？

```
search_after 翻页过程中,如果索引数据在变化:
  第 1 页: 10 条产品
  期间: 新增 3 条产品 (价格在翻页范围内)
  第 2 页: 可能重复/跳过数据

  PIT 解决: 快照机制 → 翻页期间数据不变
```

### 3.2 使用方式

```json
// 1. 创建 PIT（快照指针）
POST /products_ds/_pit?keep_alive=1m
// 返回: { "id": "46ToAwMD..." }

// 2. 用 PIT 搜索
{
  "pit": {
    "id": "46ToAwMD...",      // ← PIT ID
    "keep_alive": "1m"
  },
  "size": 20,
  "sort": [
    { "price": "asc" },
    { "_shard_doc": "asc" }   // ← PIT 下用 _shard_doc 不用 _id
  ],
  "search_after": [3999, 42]  // price=3999, _shard_doc=42
}

// 3. 用完释放
DELETE /_pit
{ "id": "46ToAwMD..." }
```

### 3.3 PIT vs 普通 search

| 维度 | from/size | search_after | search_after + PIT |
|------|-----------|-------------|---------------------|
| 翻页方式 | 从头扫 | 从上一页跳 | 从快照跳 |
| 一致性 | ❌ 无 | ⚠️ 可能重复/跳过 | ✅ 快照保证 |
| 排序要求 | 无 | 必须有唯一排序 | 用 `_shard_doc` |
| 适用场景 | 浅翻页（1-3页）| 深翻页（不担心删改）| 深翻页（生产环境）|

---

## §4. nest-search 改造

### 4.1 当前分页（search.queries.ts）

```ts
// search.service.ts
return {
  total: result.hits.total,
  page: params.page,       // 当前页数
  size: params.size,
  items: result.hits.hits.map((hit: any) => hit._source),
};
```

问题：
1. 用 `from=(page-1)*size` 计算——深分页慢
2. 没有返回 sort 值——前端无法拿 search_after 值
3. 没有翻页辅助字段

### 4.2 改造：search.service.ts

```ts
async searchProducts(businessLine: string, params) {
  const index = this.getIndex(businessLine);
  const query = buildProductSearchQuery(params);

  // 深翻页用 search_after 代替 from/size
  let searchBody: any = { query: query.query, size: params.size };
  if (params.searchAfter) {
    searchBody.search_after = params.searchAfter;
  } else if (params.page && !params.searchAfter) {
    searchBody.from = (params.page - 1) * params.size;
  }

  // 排序
  searchBody.sort = [
    { _score: 'desc' },
    { syncedAt: 'desc' },
    { productId: 'asc' },  // 唯一键兜底
  ];

  const result = await this.esService.search(index, searchBody);

  // 返回下一页 cursor
  const hits = result.hits.hits;
  const nextCursor = hits.length === params.size
    ? hits[hits.length - 1].sort   // 最后一条的 sort 值
    : null;

  return {
    total: result.hits.total,
    page: params.page,
    size: params.size,
    items: hits.map((hit: any) => hit._source),
    nextCursor,  // ← 前端存这个,下页请求时回传
  };
}
```

### 4.3 前端用法

```typescript
// 前端
let cursor = null;

async function loadMore() {
  const result = await fetch(`/api/search/ds/products`, {
    method: 'POST',
    body: JSON.stringify({
      keyword: '显示器',
      size: 20,
      searchAfter: cursor,  // 翻页时传上一页的 nextCursor
    }),
  });

  const data = await result.json();
  cursor = data.nextCursor;  // 保存 cursor 供下一页

  products.push(...data.items);
  if (!cursor) {
    showMessage('没有更多了');
  }
}
```

---

## §5. 改造 controller

```ts
// search.controller.ts
@Post('products')
searchProducts(
  @Param('businessLine') businessLine: string,
  @Body() body: {
    keyword?: string;
    category?: string;
    brand?: string;
    page?: number;
    size?: number;
    searchAfter?: any[];  // ← 新增
  },
) {
  return this.searchService.searchProducts(businessLine, body);
}
```

**为什么从 GET 改成 POST**：`searchAfter` 是数组，不能用 Query 参数。

---

## §6. 设计决策

### 决策 1 · 要不要 PIT？

```
nest-search 场景：
  产品数据是非实时同步（定时批量同步）
  翻页期间不会增删数据
  → 用 search_after 足够，不需要 PIT

什么时候要 PIT：
  数据实时变化（用户评论、新闻、商品变价）
  翻页一致性要求高
```

### 决策 2 · 前端从 GET 改成 POST？

```
GET: from/size 简单分页 → 可以
POST: search_after 传数组 → 必须

建议: 用 POST 统一分页 API（好用 + 安全）
```

---

## §7. Quiz

**Q1: from/size 深分页慢的根本原因？**

A) ES 不支持分页
B) 需要从每个 shard 取 from+size 条数据，越往后越浪费
C) 索引太大

**Q2: search_after 需要传什么值？**

A) 页码
B) 上一页最后一条的 sort 值
C) 查询关键词

**Q3: 为什么 sort 里必须有唯一字段？**

A) 为了让排序更快
B) 没有唯一字段时，sort 值可能完全相同，导致分页漏数据或重复
C) ES 强制要求

---

## §8. Commit Message

```
feat(search-service): 0042 深度分页 search_after

- search.service.ts: 加 searchAfter 参数,返回 nextCursor
- search.controller.ts: GET 改 POST 支持数组参数
- search.queries.ts: 加唯一排序字段 (productId)
- 21 测试还过
```

---

## §9. 跨节链接

- [0041 · Alias + Reindex](./0041-elasticsearch-alias-reindex.md) — 上一课
- [0043 · 相关性调优](./0043-elasticsearch-relevance-tuning.md) — 下一课
- [search.service.ts](../../apps/search-service/src/search/search.service.ts) — 分页实现
