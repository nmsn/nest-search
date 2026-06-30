# 0041 · Elasticsearch 零停机重建：Alias + Reindex

> Phase B' 第 2 课。0040 实战遇到了**改 mapping 必须删索引**的问题 → 用户搜索会中断。本节用 **Alias + Reindex** 解决。

## 你今天会拿到什么

1. 理解 **为什么需要零停机重建**（生产环境痛点）
2. 掌握 **Alias 索引别名**机制
3. 掌握 **Reindex API** 数据迁移
4. 实现 **原子切换 alias** 零停机
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 0040 实战踩过的坑

```
需求: 加 name_pinyin 字段（拼音搜索）
改 mapping
  ↓
❌ ES 不支持修改已有字段的 mapping (除非创建新索引)
  ↓
只能 DELETE 索引 → 重建 → 数据丢失
  ↓
sync-service 重新全量同步 (30 条数据) → 用户搜索中断 5-10 分钟
```

**生产环境更严重**：

```
1. 业务连续性: 删除索引 = 服务中断,用户报错
2. 数据丢失: 删索引前没备份就丢数据
3. 回滚困难: 重建出错很难回到原状态
```

### 1.2 解决思路

```
核心: 用户搜的不是"索引",是"别名(alias)"

products_ds (alias)  ← 实际指向  products_ds_v1 (索引)
                            ↓
                       重建 v2
                            ↓
products_ds (alias)  ← 切换指向  products_ds_v2 (索引)

用户始终搜 products_ds,毫秒级切换,无感知
```

---

## §2. Alias 机制

### 2.1 创建 alias

```bash
# 创建索引
PUT /products_ds_v1

# 创建 alias 指向 v1
POST /_aliases
{
  "actions": [
    { "add": { "index": "products_ds_v1", "alias": "products_ds" } }
  ]
}
```

之后**所有查询/写入都用 `products_ds`**（alias 名），不直接用 `products_ds_v1`。

### 2.2 一次性建索引 + alias

```bash
PUT /products_ds_v1
{
  "aliases": {
    "products_ds": {}
  }
}
```

### 2.3 查询 alias

```bash
GET /products_ds/_search
# 实际查的是 products_ds_v1

GET /_alias/products_ds
# 返回 alias 指向的所有索引
```

### 2.4 切换 alias（核心操作）

```bash
POST /_aliases
{
  "actions": [
    { "remove": { "index": "products_ds_v1", "alias": "products_ds" } },
    { "add":    { "index": "products_ds_v2", "alias": "products_ds" } }
  ]
}
```

**关键**：ES 内部用**原子事务**保证这两个操作同时生效，不会出现 alias 指向"空"的状态。

---

## §3. Reindex API

### 3.1 基础用法

```bash
# 复制 products_ds_v1 数据到 products_ds_v2
POST /_reindex
{
  "source": { "index": "products_ds_v1" },
  "dest":   { "index": "products_ds_v2" }
}
```

### 3.2 异步 reindex（大数据量）

```bash
POST /_reindex?wait_for_completion=false
{
  "source": { "index": "products_ds_v1" },
  "dest":   { "index": "products_ds_v2" }
}
# 返回: { "task": "abc123" }

GET /_tasks/abc123
# 查看进度: { "completed": 5000, "total": 10000 }
```

### 3.3 性能

| 数据量 | 耗时 | 备注 |
|--------|------|------|
| 1 万条 | 几秒 | 同步 reindex |
| 100 万条 | 几十秒 | 推荐异步 |
| 1000 万条 | 几分钟 | 必须异步 + scroll |
| 1 亿+ | 小时级 | 需分片并行 |

### 3.4 切片并行

```bash
POST /_reindex
{
  "source": { "index": "products_ds_v1", "size": 1000 },
  "dest":   { "index": "products_ds_v2" },
  "slices": 5  # 5 个分片并行
}
```

---

## §4. 完整零停机流程

### 4.1 标准 5 步

```
1. 创建新索引 (新 mapping)
   PUT /products_ds_v2 { mappings: ... }

2. Reindex (复制数据)
   POST /_reindex { source: v1, dest: v2 }

3. 暂停写入 (业务方停手)
   # 业务代码临时不再写 ES

4. 原子切换 alias
   POST /_aliases { actions: [remove v1, add v2] }

5. 恢复写入
   # 业务代码继续写 ES (走 alias,自动到 v2)
   # 删旧索引 (可选): DELETE /products_ds_v1
```

### 4.2 双写方案（更安全）

```
1. 双写阶段 (1-2 天):
   业务代码同时写 v1 和 v2
   用户搜索走 alias (v1)

2. 验证 v2 数据完整性:
   抽样对比 v1 和 v2 数据

3. 切换 alias 指向 v2
   停止写 v1,只写 v2

4. 删除 v1
```

---

## §5. nest-search 改造

### 5.1 现状问题

```ts
// 业务代码直接用具体索引名
const index = BUSINESS_LINES[businessLine].esIndex;
// 'products_ds'  ← 硬编码,没有 alias 概念
```

### 5.2 改造：分两层

```
business-lines.ts:
  esIndex: 'products_ds'  ← 改成 alias 名 (逻辑名)
  esIndexVersion: 'v1'    ← 新增版本号

elasticsearch.init.ts:
  根据 alias + version 拼出实际索引名: products_ds_v1
  启动时建 alias: products_ds → products_ds_v1
```

### 5.3 实际代码

```ts
// business-lines.ts
export const BUSINESS_LINES = {
  ds: { code: 'ds', esIndex: 'products_ds' },  // 保持逻辑名
  zk: { code: 'zk', esIndex: 'products_zk' },
  meeting: { code: 'meeting', esIndex: 'products_meeting' },
};

// elasticsearch.init.ts
async function initIndicesWithAlias(esService) {
  for (const [, config] of Object.entries(BUSINESS_LINES)) {
    const alias = config.esIndex;            // 'products_ds'
    const version = 'v1';                    // 当前版本
    const realIndex = `${alias}_${version}`; // 'products_ds_v1'

    // 创建带 alias 的索引
    await esService.createIndexIfNotExists(realIndex, {
      aliases: { [alias]: {} },
      mappings: PRODUCT_MAPPINGS,
    });
  }
}
```

### 5.4 Reindex 工具函数

```ts
// elasticsearch.service.ts
async reindex(oldIndex: string, newIndex: string) {
  // 1. 创建新索引 (调用方负责)
  // 2. 复制数据
  const result = await this.client.reindex({
    refresh: true,
    source: { index: oldIndex },
    dest:   { index: newIndex },
  });
  // 3. 返回结果
  return {
    total: result.total,
    created: result.created,
    updated: result.updated,
    failures: result.failures,
  };
}

async switchAlias(aliasName: string, fromIndex: string, toIndex: string) {
  await this.client.indices.updateAliases({
    actions: [
      { remove: { index: fromIndex, alias: aliasName } },
      { add:    { index: toIndex,   alias: aliasName } },
    ],
  });
}
```

---

## §6. 实战演示

**场景**：把 0040 改造的 mapping（加 name_pinyin）走 alias 流程升级

```
现状:
  索引名: products_ds_v1 (有 IK + pinyin mapping)
  alias: products_ds → products_ds_v1 ✅
  
需求: 加一个新的 analyzed 字段
  1. 创建 products_ds_v2 (新 mapping)
  2. reindex v1 → v2
  3. 切换 alias: v1 → v2
  4. 删除 v1
```

### 动手步骤

```
1. 改 business-lines.ts: esIndex 保持逻辑名
2. 改 elasticsearch.init.ts: 启动时建 alias
3. 加 elasticsearch.service.ts: reindex + switchAlias
4. 验证现有流程 (alias 已生效)
5. 模拟 v1 → v2 升级 (reindex + switch)
6. 21 测试
```

---

## §7. 设计决策

### 决策 1 · 索引版本号格式？

```
方案 A: v1, v2, v3      ← 数字版本 (推荐)
方案 B: 时间戳 20260627
方案 C: git SHA

数字版本简单,够用。
```

### 决策 2 · 一个 alias 指向多个索引？

```
应用场景:
  写 alias  → 多个索引（双写）
  读 alias  → 单个索引

或:
  按业务线分 alias (products_ds)
  按时间分索引 (products_ds_202606, products_ds_202607)
  0045 ILM 会讲到
```

### 决策 3 · 切换瞬间双索引怎么办？

```
原子切换 (ES 内部事务):
  remove v1 + add v2
  → 同一时刻只指向一个索引
  → 不会丢请求
```

---

## §8. Quiz

**Q1: 为什么用 alias 而不直接用索引名？**

A) alias 性能更好
B) 用 alias 可以零停机切换索引（reindex + 切换 alias）
C) alias 占内存更小

**Q2: Reindex 期间用户能正常搜索吗？**

A) 不能，会中断
B) 能，alias 仍指向旧索引，不影响
C) 只有部分能

**Q3: 切换 alias 时会发生什么？**

A) 简单的修改配置
B) 原子事务，remove + add 同时生效，不会出现"空指针"状态
C) 会丢失 1-2 秒请求

---

## §9. Commit Message

```
feat(search-service): 0041 零停机重建索引 (alias + reindex)

- business-lines.ts: 保持 esIndex 为逻辑名 (alias 名)
- elasticsearch.init.ts: 启动时建索引并绑 alias
- elasticsearch.service.ts: 加 reindex + switchAlias 工具
- 21 测试还过
```

---

## §10. 跨节链接

- [0040 · IK 中文分词](./0040-elasticsearch-ik-analyzer.md) — 上一课（为什么需要零停机）
- [0042 · 深度分页](./0042-elasticsearch-search-after-pit.md) — 下一课
- [elasticsearch.init.ts](../../apps/search-service/src/elasticsearch/elasticsearch.init.ts) — alias 配置
- [elasticsearch.service.ts](../../apps/search-service/src/elasticsearch/elasticsearch.service.ts) — reindex 工具
