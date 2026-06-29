# 0040 · Elasticsearch 中文分词：IK 插件 + pinyin + 同义词

> Phase B' 第 1 课（ES 企业级 8 节）。0037-0039 讲了基础，本节**解决真实业务问题**：前端搜索"海信 65 寸"必须能匹配到"海信 65寸商用显示器"。

## 你今天会拿到什么

1. 理解为什么 **standard analyzer 对中文无效**
2. 安装 **IK 插件**（Docker 方式）
3. 改造 **Mapping** 使用 IK
4. 加 **pinyin 插件**（拼音搜索）
5. 加 **同义词词典**（"显示器" = "显示屏"）
6. 21 测试还过 + 1 个 commit

---

## §1. 业务场景

**问题**：当前 search-service 用 `standard analyzer`：

```
POST _analyze
{ "analyzer": "standard", "text": "海信 65 寸商用显示器" }

输出: ["海信", "65", "寸", "商用", "显示器"]  ← standard 把中文每个字都当一个词
```

前端搜索"65寸"（无空格）：

```
GET /api/search/ds/products?keyword=65寸

匹配不到 "65 寸商用显示器"
→ 因为索引里只有 ["65", "寸"] 两个独立 term
→ "65寸" 不会被切分成这两个词
```

**解决**：用 IK 插件按中文语义分词。

```
POST _analyze
{ "analyzer": "ik_max_word", "text": "海信 65寸商用显示器" }

输出: ["海信", "65", "寸", "65寸", "商用", "显示", "显示器", "商用显示", "商用显示器", ...]
```

**IK 两种分词模式**：

| 模式 | 行为 | 用途 |
|---|---|---|
| `ik_smart` | 粗粒度（最少切分） | 索引时用（节省空间） |
| `ik_max_word` | 细粒度（最多切分） | 搜索时用（提高召回） |

---

## §2. 安装 IK 插件（Docker 方式）

### 当前 docker-compose 用的官方镜像

```yaml
# docker-compose.yml
elasticsearch:
  image: elasticsearch:8.12.0
  # 没有 IK 插件
```

### 改造：自定义 Dockerfile

**方式 A**：用预装 IK 的镜像（社区维护）

```yaml
elasticsearch:
  image: arnon/docker-elasticsearch-ik:8.12.0
```

**方式 B**：自己 build（更可控）

```dockerfile
# docker/elasticsearch/Dockerfile
FROM elasticsearch:8.12.0
RUN bin/elasticsearch-plugin install \
  https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v8.12.0/elasticsearch-analysis-ik-8.12.0.zip
```

```yaml
# docker-compose.yml
elasticsearch:
  build: ./docker/elasticsearch
```

**pinyin 插件同样方式**：

```dockerfile
RUN bin/elasticsearch-plugin install \
  https://github.com/medcl/elasticsearch-analysis-pinyin/releases/download/v8.12.0/elasticsearch-analysis-pinyin-8.12.0.zip
```

---

## §3. 改造 Mapping

### 现状（search-service）

```ts
// elasticsearch.init.ts
{
  properties: {
    name: { type: 'text', analyzer: 'standard' },  // ❌ 中文分词差
    spec: { type: 'text' },                          // ❌ 默认 standard
  }
}
```

### 改造后

```ts
// 全局 default analyzer
{
  properties: {
    productId: { type: 'keyword' },
    name: {
      type: 'text',
      analyzer: 'ik_max_word',         // 索引时细粒度分词
      search_analyzer: 'ik_smart',    // 搜索时粗粒度分词（提高准确率）
    },
    category: { type: 'keyword' },
    brand: { type: 'keyword' },
    model: { type: 'keyword' },
    spec: {
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
    },
    // 拼音搜索字段
    name_pinyin: {
      type: 'text',
      analyzer: 'pinyin',
      fields: {
        keyword: { type: 'keyword' },  // 支持精确匹配 + 排序
      },
    },
    price: { type: 'float' },
    stock: { type: 'integer' },
    syncedAt: { type: 'date' },
    businessLine: { type: 'keyword' },
  }
}
```

---

## §4. 同义词词典

### 业务需求

```
用户搜"显示屏" → 也能匹配到"显示器"
用户搜"笔记本" → 也能匹配到"笔记本电脑"
```

### IK 同义词配置

```bash
# 1. 在 ES 配置目录创建词典文件
mkdir -p docker/elasticsearch/config/analysis-ik

# 2. 创建词典
cat > docker/elasticsearch/config/analysis-ik/synonym.txt <<EOF
显示器,显示屏
笔记本,笔记本电脑
电视,电视机
EOF

# 3. 挂载到容器
# docker-compose.yml
elasticsearch:
  volumes:
    - ./docker/elasticsearch/config/analysis-ik:/usr/share/elasticsearch/config/analysis-ik
```

### Mapping 使用同义词

```ts
{
  properties: {
    name: {
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
      // 搜索时启用同义词
    }
  }
}
```

ES 8.x 的 IK 同义词需要在 **index 级别** 配置 `analysis.filter`：

```ts
// 创建索引时加 settings
{
  settings: {
    analysis: {
      filter: {
        my_synonym: {
          type: 'synonym_graph',
          synonyms_path: 'analysis-ik/synonym.txt',
          updateable: true,  // 支持热更新词典
        },
      },
      analyzer: {
        ik_synonym: {
          type: 'custom',
          tokenizer: 'ik_smart',
          filter: ['my_synonym'],
        },
      },
    },
  },
  properties: {
    name: {
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_synonym',  // ← 搜索时用带同义词的 analyzer
    },
  },
}
```

---

## §5. 拼音搜索（pinyin 插件）

### 业务需求

```
用户搜"haixin" → 也能匹配到"海信"
用户搜"hskj" → 也能匹配到"海视科技"（首字母）
```

### Mapping

```ts
{
  properties: {
    name: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart' },
    // 拼音字段:同时支持全拼/首字母
    name_pinyin: {
      type: 'text',
      analyzer: 'pinyin',
      fields: {
        keyword: { type: 'keyword' },
      },
    },
  }
}
```

### 同步写入时双写

```ts
// sync.consumer.ts bulk operation
const operations = filtered.flatMap((doc) => [
  { index: { _index: index, _id: doc.productId } },
  {
    ...doc,
    name_pinyin: doc.name,  // 用同名,ES pinyin analyzer 自动转拼音
  },
]);
```

---

## §6. 改造步骤

1. 创建 `docker/elasticsearch/Dockerfile`
2. 改 `docker-compose.yml` 用 build 而非 image
3. 创建 `docker/elasticsearch/config/analysis-ik/synonym.txt`
4. 改 `elasticsearch.init.ts` mapping
5. 改 `sync.consumer.ts` 双写 name_pinyin
6. 重建 ES 容器 + 重建索引
7. 跑测试

---

## §7. 验证

```bash
# 1. 启动 ES
docker compose up -d elasticsearch

# 2. 验证 IK 插件装好
curl http://localhost:9200/_cat/plugins
# 应显示 analysis-ik 和 analysis-pinyin

# 3. 测试分词
curl -X POST 'http://localhost:9200/products_ds/_analyze' \
  -H 'Content-Type: application/json' \
  -d '{ "analyzer": "ik_max_word", "text": "海信 65寸商用显示器" }'

# 4. 测试搜索
curl 'http://localhost:9200/products_ds/_search?q=name:海信'
```

---

## §8. 设计决策

### 决策 1 · 用 `ik_max_word` 索引，`ik_smart` 搜索？

```
ik_max_word 索引:
  "显示器" → [显示, 显示器, 视器]  ← 召回率高

ik_smart 搜索:
  用户搜"显示" → [显示]  ← 准确率高

组合: 索引细,搜索粗 → 既不漏掉结果,又不会出乱匹配
```

### 决策 2 · 同义词用 `synonym_graph` 还是 `synonym`？

```
synonym_graph (推荐):
  ✅ 支持多词同义词
  ✅ 同义词可重叠
  ❌ 性能稍差

synonym (ES 7.x 旧版):
  ❌ 不支持多词
  简单场景够用
```

### 决策 3 · 拼音字段存原始文本还是只存拼音？

```
只存拼音 (本节方案):
  优点: 简单,IK analyzer 自动转换
  缺点: 失去原文字段

双写 (name + name_pinyin):
  ✅ 保留原文 + 拼音
  ✅ 既能中文搜索也能拼音搜索
  ❌ 索引空间 +30%
```

---

## §9. Quiz

**Q1: 为什么用 IK 替代 standard analyzer？**

A) IK 更快
B) standard 把每个中文字当独立 term，IK 按中文语义分词
C) standard 不支持中文

**Q2: `ik_max_word` 和 `ik_smart` 怎么搭配用？**

A) 都用于索引
B) 索引用 `ik_max_word`（细粒度），搜索用 `ik_smart`（粗粒度）
C) 都用于搜索

**Q3: 拼音搜索字段的最佳实践是？**

A) 只存原名
B) 双写原名 + pinyin 字段
C) 用 `keyword` 类型

---

## §10. Commit Message

```
feat(search-service): 0040 IK 中文分词 + pinyin + 同义词

- docker-compose 加 IK 插件 (自定义 Dockerfile)
- mapping 加 ik_max_word 索引 + ik_smart 搜索
- 加 pinyin 字段支持拼音搜索
- 加 synonym.txt 同义词词典
- 21 测试还过
```

---

## §11. 跨节链接

- [0039 · ES 性能 + 企业级](./0039-elasticsearch-performance-enterprise.md) — 上一课
- [0041 · 零停机重建索引](./0041-elasticsearch-alias-reindex.md) — 下一课
- [elasticsearch.init.ts](../../apps/search-service/src/elasticsearch/elasticsearch.init.ts) — mapping
