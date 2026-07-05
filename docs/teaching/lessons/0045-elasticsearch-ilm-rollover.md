# 0045 · Elasticsearch 索引生命周期：ILM + 滚动索引

> Phase B' 第 6 课。nest-search 数据是**定时同步**来的，会一直增长。本节讲怎么**自动管理索引生命周期**：超过大小/时间自动归档、删除。

## 你今天会拿到什么

1. 理解 **为什么需要 ILM**（无限增长的索引问题）
2. 理解 **ILM 4 个阶段**（hot/warm/cold/delete）
3. 理解 **滚动索引**（rollover）原理
4. 学会配置 **ILM policy**
5. nest-search 不实际启用 ILM（数据量小），但**了解原理 + 标记未来接入点**
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 数据增长

```
当前: 30 条产品（一个 index）
3 个月后: 10000 条
6 个月后: 50000 条
1 年后: 100000 条

一个 index 100000 条:
  - 搜索性能变差（倒排索引太大）
  - 备份/恢复慢
  - 删除一条产品影响范围大（数据迁移）
```

### 1.2 业务场景：按月归档

```
每月一次全量同步（30 天的产品数据）
理想: 每月一个独立 index
  products_ds_202601
  products_ds_202602
  products_ds_202603
  ...

好处:
  ✅ 单 index 小 → 搜索快
  ✅ 删除某月数据 = 删一个 index（秒级）
  ✅ 备份简单（按月备份）
  ✅ 历史数据放低配硬件，热点数据放高配
```

---

## §2. ILM 概念

### 2.1 4 个阶段

```
hot:   写入频繁,需要高性能 SSD
       ↓ (数据变旧/索引变大)
warm:  只读,查询变少,放普通磁盘
       ↓ (数据不再活跃)
cold:  几乎不查,放归档存储(便宜)
       ↓ (超过保留期)
delete: 自动删除
```

### 2.2 触发条件

```
每个阶段都可以配置:
  - max_age: 超过 N 天
  - max_size: 索引超过 N GB
  - max_docs: 文档数超过 N
  - max_primary_shard_size: 单个分片超过 N GB
```

### 2.3 完整 ILM Policy

```json
PUT /_ilm/policy/products_policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_age": "30d",
            "max_primary_shard_size": "10gb"
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "cold": {
        "min_age": "90d",
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

---

## §3. Rollover（滚动索引）

### 3.1 原理

```
初始:
  products_ds-write (write alias, 指向真实索引)
  products_ds-read  (read alias, 也指向同一索引)

触发条件满足 (30 天/10GB):
  ES 创建 products_ds-000002
  把 -write / -read alias 切到 000002
  000001 进入 warm 阶段

后续:
  000002 写满 → 创建 000003
  000002 进入 warm
  ...
```

### 3.2 关键别名

```
write alias (只一个,指向当前可写索引):
  products_ds-write → products_ds-000001 → 002 → 003

read alias (可指多个,查询时合并):
  products_ds-read → [000001, 000002, 000003]
  ↑ 搜索时 ES 自动从所有 alias 指向的索引里查
```

### 3.3 用法

```bash
# 1. 创建初始索引 (带 ILM + aliases)
PUT /products_ds-000001
{
  "aliases": {
    "products_ds-write": {},
    "products_ds-read": {}
  },
  "settings": {
    "index.lifecycle.name": "products_policy"
  }
}

# 2. 写入 (通过 write alias)
POST /products_ds-write/_doc/P001
{ ... }

# 3. 手动 rollover
POST /products_ds-write/_rollover
{
  "conditions": {
    "max_age": "30d"
  }
}

# 4. 读取 (通过 read alias,跨所有索引)
GET /products_ds-read/_search
```

---

## §4. nest-search 完整实施 ILM（企业级标准）

### 4.1 课程定位更正

```
⚠️ 重要: nest-search 是企业级课程, 不是 demo 项目
本节按真实生产场景完整实施 ILM, 不是"现在不需要以后再加"
```

### 4.2 nest-search 当前 sync 模式

```
真实生产数据:
  - 3 个业务线 (ds / zk / meeting)
  - 每日定时全量同步
  - 每天增量同步
  - 单日 1 万 - 10 万条数据
  - 一年数据: 千万级

→ 必须用 ILM 管理, 不能等"以后"
```

### 4.3 ILM Policy 配置

```bash
# 创建 ILM policy
PUT /_ilm/policy/products_policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_primary_shard_size": "5gb"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "180d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### 4.4 nest-search 接入 ILM（生产实战）

```ts
// sync.service.ts
async triggerFullSync(businessLine: string) {
  const writeAlias = `products_${businessLine}-write`;
  const readAlias = `products_${businessLine}-read`;
  
  // 通过 write alias 写入 (ILM 自动 rollover)
  const operations = filtered.flatMap((doc) => [
    { index: { _index: writeAlias, _id: doc.productId } },
    docWithPinyin,
  ]);
  
  await this.esClient.bulk({ operations });
}

// init.ts 创建初始索引 (带 write/read alias)
const INITIAL_INDEX_BODY = {
  aliases: {
    [`products_${businessLine}-write`]: { is_write_index: true },
    [`products_${businessLine}-read`]: {},
  },
  settings: {
    'index.lifecycle.name': 'products_policy',
    'index.lifecycle.rollover_alias': `products_${businessLine}-write`,
  },
  mappings: PRODUCT_MAPPINGS,
};
```

### 4.5 真实生产 ILM checklist

```
✅ nest-search 必须做的:
  ☐ 配 ILM policy
  ☐ 索引 template 带 rollover_alias
  ☐ write/read alias 拆分
  ☐ 监控 ILM 执行状态
  ☐ 7/30/180 天阶段配置
  ☐ 备份策略 (snapshot)
```

---

## §5. 备查：ILM 状态查询

```bash
# 查所有 policy
GET /_ilm/policy

# 查索引的 ILM 状态
GET /products_ds_v1/_ilm/explain

# 返回:
{
  "index": "products_ds_v1",
  "managed": false,    # 是否在 ILM 管理下
  "policy": "products_policy",
  "phase": "hot",
  "phase_time_millis": 1700000000000,
  "action": "rollover",
  "action_time_millis": 1700000000000,
  "step": "complete"
}
```

---

## §6. 设计决策

### 决策 1 · nest-search 何时引入 ILM？

```
数据量指标（任一触发）:
  - 单 index > 10 GB
  - 单 index > 1000 万文档
  - 月增长 > 100 万

现在: 30 条,远低于阈值
建议: 阶段保留接入点,数据量增长后再启用
```

### 决策 2 · 业务线（ds/zk/meeting）每个单独 ILM？

```
✅ 每个业务线独立 ILM policy
原因:
  - 数据量差异大
  - 业务重要性不同
  - 备份策略不同
```

### 决策 3 · 用 write alias 还是写实际索引？

```
✅ 用 write alias (推荐)
原因:
  - ILM 自动管理底层索引
  - 业务代码不感知
```

---

## §7. Quiz

**Q1: ILM 适用于什么场景？**

A) 小型项目几十条数据
B) 数据量大、生命周期长的索引
C) 临时测试索引

**Q2: Rollover 的触发条件有哪些？**

A) max_age（时间）
B) max_size（索引大小）
C) max_docs（文档数）
D) 以上都是

**Q3: nest-search 现在需要 ILM 吗？**

A) 需要（任何项目都需要）
B) 不需要（数据量小），但要预留接入点
C) 不需要（永远不需要）

---

## §8. Commit Message

```
docs(teaching): 0045 ES 索引生命周期 ILM lesson
- 标记未来接入点,不实际启用
- 21 测试还过
```

---

## §9. 跨节链接

- [0044 · 聚合实战](./0044-elasticsearch-aggregations.md) — 上一课
- [0046 · 慢查询调优](./0046-elasticsearch-slow-query-tuning.md) — 下一课
- [elasticsearch.init.ts](../../apps/search-service/src/elasticsearch/elasticsearch.init.ts) — 索引创建逻辑（未来 ILM 接入点）
