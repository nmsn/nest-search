# 数据存储选型对比手册

> ES / PostgreSQL / MySQL / MongoDB 四大主流存储全方位对比，帮你做技术选型。

---

## 目录

- [§1. 一句话总结](#1-一句话总结)
- [§2. 全方位对比表](#2-全方位对比表)
- [§3. 核心能力详解](#3-核心能力详解)
  - [3.1 数据模型](#31-数据模型)
  - [3.2 事务能力](#32-事务能力)
  - [3.3 查询能力](#33-查询能力)
  - [3.4 性能特点](#34-性能特点)
  - [3.5 扩展性](#35-扩展性)
  - [3.6 运维成本](#36-运维成本)
- [§4. 典型使用场景](#4-典型使用场景)
- [§5. 选型决策树](#5-选型决策树)
- [§6. 企业级组合方案](#6-企业级组合方案)
- [§7. nest-search 当前架构分析](#7-nest-search-当前架构分析)

---

## §1. 一句话总结

| 存储 | 一句话定位 |
|------|-----------|
| **PostgreSQL** | 功能最强的开源关系型数据库（事务、关系、扩展） |
| **MySQL** | 最流行的开源关系型数据库（简单可靠、读性能强） |
| **MongoDB** | 最流行的文档数据库（灵活 schema、水平扩展） |
| **Elasticsearch** | 分布式搜索和分析引擎（全文搜索、聚合、向量） |

---

## §2. 全方位对比表

| 维度 | PostgreSQL | MySQL | MongoDB | Elasticsearch |
|------|-----------|-------|---------|---------------|
| **类型** | 关系型 | 关系型 | 文档型 | 搜索引擎 |
| **数据模型** | 表 + 行 | 表 + 行 | JSON 文档 | JSON 文档 |
| **schema** | 强 schema | 强 schema | 弱 schema | 弱 schema |
| **事务** | ✅ 完整 ACID | ✅ ACID | ⚠️ 4.0+ 多文档事务 | ❌ 不支持 |
| **JOIN** | ✅ 强大 | ✅ 支持 | ⚠️ $lookup（弱） | ❌ 不支持 |
| **全文搜索** | ⭐⭐⭐ 一般 | ⭐⭐ 较弱 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 极强 |
| **聚合分析** | ⭐⭐⭐ SQL 聚合 | ⭐⭐⭐ SQL 聚合 | ⭐⭐⭐ 聚合管道 | ⭐⭐⭐⭐⭐ 极强 |
| **复杂查询** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **读性能** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **写性能** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **水平扩展** | ⭐⭐ 复杂 | ⭐⭐ 复杂 | ⭐⭐⭐⭐⭐ 原生 | ⭐⭐⭐⭐⭐ 原生 |
| **数据一致性** | 强一致 | 强一致 | 可调（强/最终） | 近实时（~1s） |
| **运维复杂度** | ⭐⭐ 中等 | ⭐⭐ 中等 | ⭐⭐⭐ 中等偏高 | ⭐⭐⭐⭐ 高 |
| **生态成熟度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **学习曲线** | 中等 | 较平 | 较平 | 较陡 |
| **License** | BSD（宽松） | GPL（商业需授权） | SSPL（限制云厂商） | Elastic + SSPL |
| **典型用户** | 苹果、Instagram、Notion | 淘宝、Facebook、Twitter | Uber、Adobe、Cisco | Netflix、LinkedIn、Stack Overflow |

---

## §3. 核心能力详解

### 3.1 数据模型

#### PostgreSQL / MySQL（关系型）

```sql
-- 强 schema，表结构固定
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category_id INT REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**特点**：
- 字段类型必须预先定义
- 改 schema 需要 ALTER TABLE
- 关联表通过外键 + JOIN 关联

#### MongoDB（文档型）

```javascript
// 弱 schema，每个文档可以不同
{
  _id: ObjectId("..."),
  name: "55寸显示器",
  price: 3999,
  category: "显示器",
  attributes: {  // 嵌套对象，无 schema 限制
    "颜色": "黑色",
    "尺寸": "55寸"
  }
}

{
  _id: ObjectId("..."),
  name: "道闸控制器",
  price: 1500,
  // 没有 attributes 字段也可以
}
```

**特点**：
- 每个文档可以有不同的字段
- 嵌套对象天然支持
- 适合 schema 多变的业务

#### Elasticsearch（搜索引擎）

```json
{
  "_index": "products",
  "_id": "P001",
  "_source": {
    "productId": "P001",
    "name": "55寸显示器",
    "price": 3999.0,
    "spec": "屏幕 55 英寸, 4K, 60Hz",
    "syncedAt": "2026-06-27T10:30:00Z"
  }
}
```

**特点**：
- 文档结构以 _source 存储
- Mapping 定义字段类型（可选）
- 不支持 JOIN（需反范式化）

---

### 3.2 事务能力

| 存储 | 事务支持 | 隔离级别 | 实际能力 |
|------|---------|---------|---------|
| **PostgreSQL** | ✅ 完整 ACID | 4 种（RU/RC/RR/Serializable） | 最强 |
| **MySQL (InnoDB)** | ✅ ACID | 4 种（默认 RR） | 强 |
| **MongoDB** | ⚠️ 4.0+ 多文档 ACID | snapshot | 单文档天然，多文档 4.0+ |
| **Elasticsearch** | ❌ 不支持 | - | 仅最终一致 |

**事务对比示例**（转账）：

```sql
-- PostgreSQL / MySQL：天然支持
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

```javascript
// MongoDB：4.0+ 支持
const session = client.startSession();
session.startTransaction();
await accounts.updateOne({id: 1}, {$inc: {balance: -100}}, {session});
await accounts.updateOne({id: 2}, {$inc: {balance: 100}}, {session});
await session.commitTransaction();
```

```json
// Elasticsearch：❌ 不可能原子完成两件事
// 必须靠业务补偿（Outbox 模式）
```

---

### 3.3 查询能力

#### SQL 风格（PG / MySQL）

```sql
-- 强项：复杂关系查询
SELECT p.name, c.name AS category, AVG(r.score) AS avg_rating
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN reviews r ON r.product_id = p.id
WHERE p.price BETWEEN 1000 AND 5000
  AND c.name = '显示器'
  AND p.name LIKE '%商用%'
GROUP BY p.id, c.name
HAVING avg_rating > 4.0
ORDER BY avg_rating DESC
LIMIT 20;
```

#### MongoDB 风格

```javascript
// 聚合管道
db.products.aggregate([
  { $match: { price: { $gte: 1000, $lte: 5000 }, "category": "显示器" } },
  { $lookup: { from: "reviews", localField: "_id", foreignField: "productId", as: "reviews" } },
  { $unwind: "$reviews" },
  { $group: { _id: "$_id", name: { $first: "$name" }, avgScore: { $avg: "$reviews.score" } } },
  { $match: { avgScore: { $gt: 4.0 } } },
  { $sort: { avgScore: -1 } },
  { $limit: 20 }
]);
```

#### Elasticsearch Query DSL

```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "name": "商用" } }
      ],
      "filter": [
        { "term": { "category": "显示器" } },
        { "range": { "price": { "gte": 1000, "lte": 5000 } } }
      ]
    }
  },
  "aggs": {
    "avg_rating": { "avg": { "script": "..." } }  // 评分聚合
  },
  "sort": [{ "_score": "desc" }],
  "size": 20
}
```

**查询能力对比**：

| 场景 | PG | MySQL | MongoDB | ES |
|------|----|----|----|----|
| 单表查询 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 多表 JOIN | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐（$lookup 弱）| ❌ |
| 子查询 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 全文搜索 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 模糊匹配 | ⭐⭐（pg_trgm）| ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 聚合分析 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 地理空间 | ⭐⭐⭐⭐（PostGIS）| ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 向量搜索 | ⚠️ pgvector | ⚠️ 第三方 | ❌ | ⭐⭐⭐⭐⭐ |

---

### 3.4 性能特点

#### 读性能基准（粗略量级）

```
简单主键查询:
  PG:    ~1ms
  MySQL: ~1ms
  Mongo: ~1ms
  ES:    ~5ms （需要先查 _id 倒排索引）

复杂过滤（10 列 + 全文搜索）:
  PG:    ~50ms （走 B-tree + 全文索引）
  MySQL: ~30ms （InnoDB 缓冲好）
  ES:    ~10ms （倒排索引 O(1) lookup）

聚合分析（千万级数据）:
  PG:    ~5s （全表扫 + 聚合）
  Mongo: ~3s （聚合管道）
  ES:    ~500ms （列式存储 + 预计算）
```

#### 写性能

```
单条写入:
  PG:    ~1ms
  MySQL: ~0.5ms
  Mongo: ~0.3ms （无事务）
  ES:    ~5ms （refresh + translog）

批量写入（1万条）:
  PG:    ~5s （事务 + WAL）
  MySQL: ~3s
  Mongo: ~1s
  ES:    ~2s （bulk API）
```

#### 索引能力

| 存储 | 默认索引 | 高级索引 |
|------|---------|---------|
| **PG** | B-tree | GIN（全文 / JSONB）、BRIN（时序）、Hash、GiST（地理） |
| **MySQL** | B-tree | Fulltext（MyISAM/InnoDB）、Hash、R-tree |
| **MongoDB** | B-tree | Text（全文）、2dsphere（地理）、Hash、TTL |
| **ES** | 倒排索引 | doc_values（列存）、completion、向量索引 |

---

### 3.5 扩展性

| 存储 | 垂直扩展 | 水平扩展 | 难度 |
|------|---------|---------|------|
| **PG** | ⭐⭐⭐⭐⭐ | ⭐⭐（Citus / 分库分表）| 难 |
| **MySQL** | ⭐⭐⭐⭐⭐ | ⭐⭐（分库分表 / 主从）| 难 |
| **MongoDB** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（sharding 原生）| 易 |
| **ES** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（分片 + 副本）| 易 |

**水平扩展对比**：

```
PostgreSQL:
  - 方案 1: 主从复制（读写分离）
  - 方案 2: Citus（分布式 PG）
  - 方案 3: 应用层分库分表
  - 难度: 高

MongoDB:
  - 内置 sharding
  - 配置简单（选 shard key）
  - 难度: 低

Elasticsearch:
  - 内置分片（shard）
  - 创建索引时指定 number_of_shards
  - 副本自动同步
  - 难度: 低
```

---

### 3.6 运维成本

| 维度 | PG | MySQL | MongoDB | ES |
|------|----|----|----|----|
| 安装部署 | 简单 | 简单 | 简单 | 中等（JVM） |
| 监控工具 | pgAdmin / pg_stat | MySQL Workbench | Compass | Cerebro / Kibana |
| 备份恢复 | pg_dump / WAL | mysqldump / binlog | mongodump / oplog | snapshot / reindex |
| 升级维护 | 简单 | 简单 | 中等 | 复杂（rollover / 重建） |
| 故障排查 | 成熟 | 成熟 | 中等 | 较复杂（GC、merge） |
| 内存占用 | 中等 | 低 | 中等 | 高（JVM） |
| 硬盘占用 | 低 | 低 | 中等 | 高（副本 + 倒排） |

---

## §4. 典型使用场景

### PostgreSQL 适用场景

✅ 强事务需求（金融、订单、支付）
✅ 复杂关系查询（ERP、CRM、社交）
✅ 地理信息（PostGIS）
✅ JSON 半结构化数据（JSONB）
✅ 时序数据（TimescaleDB 扩展）
✅ 向量搜索（pgvector 扩展）
✅ 报表分析（窗口函数、CTE）

**代表用户**：Instagram、Notion、Discord、Apple、Reddit

---

### MySQL 适用场景

✅ 简单 Web 应用（CMS、博客、电商前台）
✅ 读多写少（高并发读 QPS 1万+）
✅ OLTP 场景（订单、用户、商品）
✅ 已有 MySQL 生态（运维熟悉）
✅ 简单报表（不需要复杂分析）

**代表用户**：淘宝、Facebook、Twitter、Pinterest、GitHub（早期）

---

### MongoDB 适用场景

✅ schema 多变（产品属性经常变）
✅ 文档型数据（内容管理、博客、评论）
✅ 海量数据（TB 级、单表百亿）
✅ 实时分析（聚合管道）
✅ IoT / 日志 / 时序
✅ 移动 App 后端（灵活的 JSON 响应）

**代表用户**：Uber、Adobe、Cisco、eBay、Forbes

---

### Elasticsearch 适用场景

✅ 全文搜索（电商、文档、招聘）
✅ 日志分析（ELK 三件套）
✅ 实时聚合（业务监控、Dashboard）
✅ 向量搜索（以图搜图、推荐、RAG）
✅ 搜索建议（typeahead、自动补全）
✅ 时序数据（ELK、APM 工具链）
✅ 多租户 SaaS 搜索层

**代表用户**：Netflix、LinkedIn、Stack Overflow、GitHub（搜索）、Wikipedia

---

## §5. 选型决策树

```
需要事务 + 关系查询？
├── 是 → PG 或 MySQL
│   ├── 强事务 + JSON + 高级特性 → PostgreSQL
│   └── 简单 OLTP + 高并发读 → MySQL
│
└── 否 → 看数据特点
    ├── schema 多变（文档型）→ MongoDB
    │
    └── 全文搜索 / 聚合 / 向量？→ Elasticsearch
        ├── 不需要 ES 特性 → 仍用 PG/MySQL/Mongo
        └── 需要 ES 特性 → 引入 ES 作为搜索层

最终方案: 通常是组合
  PG (主存储) + ES (搜索层) ← nest-search
  PG (主存储) + Mongo (文档) + ES (搜索) ← 复杂业务
  MySQL (主存储) + ES (日志/搜索) ← 中小型项目
```

---

## §6. 企业级组合方案

### 方案 A：PG + ES（推荐 nest-search）

```
PostgreSQL: 主存储（事务、关系）
  ├─ 用户、订单、支付
  └─ 产品元数据

Elasticsearch: 搜索层
  ├─ 产品搜索
  ├─ 日志分析
  └─ 业务监控

适用: 通用业务系统
```

### 方案 B：MySQL + ES（传统企业）

```
MySQL: 主存储（成熟运维）
ES: 搜索 + 日志

适用: 传统企业、已有 MySQL 基础设施
```

### 方案 C：PG + Mongo + ES（多模态）

```
PG: 关系数据（订单、用户）
Mongo: 文档数据（产品属性、评论）
ES: 搜索 + 日志

适用: 复杂业务（电商、内容平台）
```

### 方案 D：Mongo 单数据库（小项目）

```
Mongo: 全部
  ├─ 文档存储
  ├─ 关系（$lookup）
  └─ 全文搜索（text 索引）

适用: 中小项目、单数据库简化
```

---

## §7. nest-search 当前架构分析

### 当前选型

```
sync-service (BullMQ)
  ├─ 定时拉取第三方产品数据
  └─ bulk 写入 ES

search-service
  └─ 查 ES 返回结果

ES 索引:
  ├─ products_ds
  ├─ products_zk
  └─ products_meeting

PG (auth-service / form-service / sync-records):
  ├─ 用户、认证
  ├─ 表单数据
  └─ 同步记录
```

### 评价

| 维度 | 当前架构 | 评价 |
|------|---------|------|
| **产品搜索** | ES 单独承担 | ✅ 正确（ES 是搜索专用） |
| **产品数据来源** | 第三方同步 | ✅ ES 副本模式 |
| **用户/订单** | PG | ✅ 正确（事务） |
| **聚合分析** | ES | ✅ 正确（ES 聚合强） |
| **缺失** | 冷存储兜底 | ⚠️ 建议加 PG products_raw |
| **缺失** | 日志分析 | ⚠️ 建议引入 ELK |

### 改进建议

```
短期（保持当前架构）:
  1. ES 现有结构 OK
  2. 加 PG products_raw 冷存储
  3. ES + PG 数据回溯机制

中期（增强）:
  4. ES snapshot 备份
  5. 慢查询监控
  6. 多业务线 ES 集群分离（如果量大）

长期（架构演进）:
  7. 数据仓库（ClickHouse / Doris）做 BI
  8. 时序数据库（InfluxDB / TDengine）做监控
  9. 向量数据库（Milvus / ES dense_vector）做 AI 搜索
```

---

## §8. 何时不要用某个数据库

### 不用 PG
- 纯全文搜索（直接用 ES）
- 简单 KV 缓存（用 Redis）
- 时序数据（用 InfluxDB / TDengine）

### 不用 MySQL
- 复杂 JSON 操作（用 PG JSONB 或 Mongo）
- 大文本全文搜索（用 ES）
- 地理信息（用 PG PostGIS 或专门的地理数据库）

### 不用 MongoDB
- 强事务需求（用 PG）
- 复杂 JOIN（用 PG）
- 严格的财务数据（用 PG）

### 不用 ES
- 强事务需求
- 主数据存储（ES 不是 source of truth）
- 频繁实时写入（ES 写入有 ~1s 延迟）
- 复杂 JOIN 查询

---

## §9. 性能基准参考

> 数据来源：公开 benchmark 和社区经验值，**不是绝对值**

### 简单查询（10万条数据）

| 操作 | PG | MySQL | Mongo | ES |
|------|----|----|----|----|
| 主键查询 | 1ms | 0.5ms | 0.8ms | 5ms |
| 简单过滤 | 5ms | 3ms | 3ms | 2ms |
| 全文搜索 | 50ms | 100ms | 20ms | 5ms |
| 复杂聚合 | 200ms | 300ms | 150ms | 50ms |

### 大数据量（1000万条数据）

| 操作 | PG | MySQL | Mongo | ES |
|------|----|----|----|----|
| 主键查询 | 1ms | 0.5ms | 1ms | 10ms |
| 简单过滤 | 50ms | 30ms | 30ms | 10ms |
| 全文搜索 | 1s | 2s | 500ms | 30ms |
| 复杂聚合 | 5s | 10s | 3s | 200ms |

**结论**：
- 数据量大时，**ES 的搜索优势越明显**
- PG/MySQL 主键查询永远最快
- 复杂分析 ES 优势明显

---

## §10. 总结

| 业务需求 | 首选 | 备选 |
|----------|------|------|
| 金融/订单/支付 | **PostgreSQL** | MySQL |
| 简单 Web 应用 | **MySQL** | PostgreSQL |
| 内容管理 / 博客 | **MongoDB** | PostgreSQL (JSONB) |
| 全文搜索 | **Elasticsearch** | PostgreSQL (GIN) |
| 日志分析 | **Elasticsearch** | ClickHouse |
| 电商前台 | **PG + ES** | MySQL + ES |
| 社交平台 | **PostgreSQL** | Cassandra + ES |
| 物联网 | **InfluxDB** | TimescaleDB / ES |
| AI 搜索 | **ES (vector)** | Milvus / pgvector |
| 实时推荐 | **Redis + ES** | - |

---

**参考**：
- [0037-0039 ES 课程系列](../lessons/0037-elasticsearch-fundamentals.md)
- [Elasticsearch 官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [MongoDB 官方文档](https://www.mongodb.com/docs/)
- [MySQL 官方文档](https://dev.mysql.com/doc/)
