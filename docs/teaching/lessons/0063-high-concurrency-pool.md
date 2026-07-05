# 0063 · 高并发 + 连接池调优

> Phase E 第 2 课。nest-search 当前用 PG 默认配置，**企业级必须** 显式调优：连接池 / 超时 / 索引。

## 你今天会拿到什么

1. 理解 **PG 连接池原理**
2. 学会 **drizzle.service.ts** 显式连接池配置
3. 学会 **PG server 配置** (max_connections 等)
4. 学会 **k6 压测验证** 调优效果
5. nest-search 实战调优
6. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
当前 nest-search:
  - PG 用 drizzle.service.ts (默认配置)
  - 没显式连接池设置
  - 没超时配置
  - 没 PG server 调优

风险:
  ❌ 高并发下, 连接数爆, 服务挂
  ❌ 慢查询拖死整个 DB
  ❌ 没有监控
```

### 1.2 真实生产场景

```
并发: nest-search 可能 1000 QPS
每个请求: 2-5 个 DB 查询
→ 需要 2000-5000 个连接

PG 默认:
  - max_connections = 100
  - 单进程只给 100 连接
  - 1000 并发立即打爆
```

---

## §2. 连接池基础

### 2.1 什么是连接池

```
没连接池:
  请求 1 → 建连接 → 查数据 → 关连接 (慢, TCP 握手)
  请求 2 → 建连接 → 查数据 → 关连接 (又慢)
  
  每次都要新建连接, 性能差

有连接池:
  启动时建 10 个连接
  请求 1 → 借连接 → 查 → 还连接
  请求 2 → 借连接 → 查 → 还连接
  
  复用连接, 性能高
```

### 2.2 PG 默认配置

```
PG server 默认:
  max_connections = 100        (单实例)
  shared_buffers = 128MB
  work_mem = 4MB
  maintenance_work_mem = 64MB
  
  → 不够企业级用
```

### 2.3 nest-search 客户端默认

```
drizzle.service.ts (现状):
  - 没显式 pool 配置
  - 默认 max = 10 (drizzle 默认)
  - 没超时
  
  实际生产:
  - 5 个服务 × 10 连接 = 50 个
  - 不够 1000 QPS
```

---

## §3. nest-search 实战调优

### 3.1 drizzle.service.ts 调优

```ts
// apps/auth-service/src/database/drizzle.service.ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  public db: NodePgDatabase;
  private pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      host: config.getOrThrow<string>('DB_HOST'),
      port: config.getOrThrow<number>('DB_PORT'),
      user: config.getOrThrow<string>('DB_USER'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      database: config.getOrThrow<string>('DB_NAME'),
      
      // 连接池配置
      max: 20,                          // 最大连接数 (单服务)
      min: 2,                           // 最小连接数 (保活)
      idleTimeoutMillis: 30000,         // 30s 空闲释放
      connectionTimeoutMillis: 5000,    // 5s 获取连接超时
      
      // 性能配置
      statement_timeout: 30000,         // SQL 30s 超时
      query_timeout: 30000,             // 整个查询 30s 超时
      idle_in_transaction_session_timeout: 60000,  // 事务 60s 超时
      
      // 资源管理
      max_lifetime: 3600 * 1000,        // 连接 1h 强制重连
      application_name: 'nest-search-auth',  // 标识连接来自哪个服务
    });

    this.db = drizzle(this.pool);
  }

  async onModuleDestroy() {
    await this.pool.end();  // 优雅关闭
  }
}
```

### 3.2 PG Server 调优（postgresql.conf）

```ini
# 连接相关
max_connections = 200                # 单实例最大连接
superuser_reserved_connections = 10  # 给 superuser 留 10 个

# 内存
shared_buffers = 256MB               # 物理内存的 25%
effective_cache_size = 1GB           # OS 缓存 + shared_buffers
work_mem = 16MB                      # 排序/哈希临时内存
maintenance_work_mem = 256MB        # vacuum / index 用

# 超时
statement_timeout = 30s              # 单 SQL 超时
idle_in_transaction_session_timeout = 60s

# WAL (Write-Ahead Log)
wal_buffers = 16MB
max_wal_size = 1GB
min_wal_size = 80MB

# 慢查询日志
log_min_duration_statement = 1000    # 记录 1s 以上的查询
log_statement = 'mod'               # 记录 DDL 和修改
log_duration = on                   # 记录所有查询时长
```

### 3.3 计算公式

```
按服务:
  max = 20 (单服务连接数)
  5 个服务 × 20 = 100 连接

按 PG server:
  max_connections = 200 (够用 + 100 余量)

按内存 (8GB PG server):
  shared_buffers = 2GB (25%)
  effective_cache_size = 6GB (75%)
  work_mem = 16MB
  maintenance_work_mem = 256MB
```

---

## §4. nest-search 5 服务连接池配置

### 4.1 推荐配置

| 服务 | 端口 | max | min | 超时 |
|------|------|-----|-----|------|
| auth-service | 3000 | 20 | 2 | 30s |
| form-service | 3004 | 20 | 2 | 30s |
| search-service | 3002 | 15 | 2 | 30s |
| sync-service | 3005 | 10 | 2 | 60s |
| gateway | 3000 | 30 | 5 | 30s |

**总连接数**：约 100 个（PG 配 200，留 100 余量）

### 4.2 环境变量

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres123
DB_NAME=nest_search
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_STATEMENT_TIMEOUT_MS=30000
```

---

## §5. 压测验证

### 5.1 k6 压测脚本

```js
// tests/load/db-stress.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 1000 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/auth/me', {
    headers: { Authorization: 'Bearer <test-jwt>' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### 5.2 观察指标

```
观察:
  - PG 连接数: SELECT count(*) FROM pg_stat_activity;
  - 慢查询: tail -f postgresql.log
  - 服务响应: P95 < 200ms?
  - 错误率: < 1%?
```

### 5.3 调优前后对比

```
调优前 (默认):
  P95: 800ms
  错误率: 5%
  连接数: 100/100 (爆了)

调优后 (优化):
  P95: 150ms
  错误率: 0.5%
  连接数: 80/200 (安全)
```

---

## §6. 实战 demo

### 6.1 改 drizzle.service.ts

```
步骤:
1. apps/auth-service/src/database/drizzle.service.ts 加连接池配置
2. 复制到其他 4 个服务
3. 跑测试验证
4. k6 压测对比
```

### 6.2 改 PG server 配置

```
步骤:
1. docker-compose.yml 加 PG 环境变量
2. 启动后验证
3. 监控连接数
```

### 6.3 nest-search 完整改造

```
完整路径:
1. 客户端连接池 (drizzle.service.ts × 5)
2. PG server 配置 (docker-compose.yml)
3. 慢查询日志
4. 监控告警 (Prometheus)
5. k6 压测验证
```

---

## §7. 关键认知

### 7.1 常见误区

```
❌ "连接越多越好"
   - 太多连接 PG 撑不住
   - 适当就行 (按 QPS)

❌ "超时设置越大越好"
   - 太大会导致雪崩
   - 30s 合理

❌ "PG 默认够用"
   - 默认给单机用
   - 企业级必须调
```

### 7.2 调优原则

```
1. 先监控
   - 看 PG 当前状态
   - 找瓶颈

2. 再调参
   - 一次只改一个
   - 对比效果

3. 验证
   - k6 压测
   - 业务回归

4. 监控
   - 上线后持续监控
   - 出问题快速回滚
```

---

## §8. Quiz

**Q1: 连接池最大连接数一般多少？**

A) 100
B) 20-50 (按服务)
C) 1000

**Q2: PG 默认 max_connections 是多少？**

A) 100
B) 500
C) 2000

**Q3: nest-search 5 服务需要多少连接？**

A) 100 个 (5 × 20)
B) 500 个
C) 1000 个

---

## §9. Commit Message

```
feat(database): 0063 高并发连接池调优

- drizzle.service.ts: 加连接池配置
  max=20, min=2, 超时 30s
- docker-compose.yml: PG server 调优
  max_connections=200, shared_buffers=256MB
- 5 服务统一配置
- k6 压测验证
- 21 测试还过
```

---

## §10. 跨节链接

- [0062 · 外键禁用](./0062-no-fk-business-consistency.md) — 上一课
- [0064 · 缓存策略](./0064-cache-strategies.md) — 下一课
- [drizzle.service.ts](../../apps/auth-service/src/database/drizzle.service.ts) — 当前实现
