# 0026 · 优雅退出 + enableShutdownHooks(NestJS)

> Phase A 第 8 课。0025 建了 AllExceptionsFilter + BusinessException,0026 解决另一个缺口：**服务退出时连接泄漏**。Docker 发 SIGTERM 时，DB pool / Redis / ES / BullMQ 连接没有被正确关闭。
>
> **2026-06-24**:所有 service 都用 PostgreSQL (pg.Pool) + Pino 日志。auth-service 额外有 Redis (ioredis)。sync-service 用 BullMQ (基于 Redis)。

## 你今天会拿到什么

1. 理解 **为什么 enableShutdownHooks 是必须的**（没有它，lifecycle hook 是死代码）
2. 亲手给 4 个 service 加 `app.enableShutdownHooks()`
3. 给 form-service 的 `DrizzleService` 加 `OnModuleDestroy` → `pool.end()`
4. 理解 **SIGTERM → enableShutdownHooks → onModuleDestroy → onApplicationShutdown** 生命周期链
5. 21 测试还过 + 1 个 commit

---

## §1. 当前现状

```
enableShutdownHooks:
✅ apps/gateway/src/main.ts (line 35)
❌ apps/auth-service/src/main.ts
❌ apps/form-service/src/main.ts
❌ apps/search-service/src/main.ts
❌ apps/sync-service/src/main.ts

连接清理 (OnModuleDestroy):
✅ auth-service/redis/redis.service.ts → this.client.disconnect()
   ⚠️ 但是死代码！因为没调 enableShutdownHooks
❌ form-service/drizzle.service.ts → pool 没存为属性,无法 close
❌ search-service/elasticsearch.service.ts → 无 close
❌ sync-service/elasticsearch + bullmq → 无 close
```

**后果**：

```bash
# Docker 发 SIGTERM 给 auth-service
docker stop auth-service

# 没有 enableShutdownHooks 时:
# 1. NestJS 不监听 SIGTERM
# 2. onModuleDestroy 不触发
# 3. Redis 连接泄漏 → Redis 侧看到大量 CLOSE_WAIT
# 4. pg.Pool 连接泄漏 → PostgreSQL 侧看到 idle 连接堆积
# 5. 进程直接被 kill -9
```

---

## §2. 生命周期链

```
OS 发 SIGTERM
    ↓
NestJS 收到信号 (需要 enableShutdownHooks)
    ↓
onApplicationShutdown(signal)  ← 先触发,拿到 signal 参数
    ↓
onModuleDestroy()              ← 后触发,每个 module 级别
    ↓
进程退出
```

**关键**：没有 `enableShutdownHooks()`，整个链**不触发**。

---

## §3. 设计决策

### 决策 1 · pool 存哪里？

```ts
// 现状 (form-service/drizzle.service.ts)
async onModuleInit() {
  const pool = new Pool({ connectionString: databaseUrl });  // ← 局部变量
  this.db = drizzle(pool, { schema });
}

// 问题:pool 是局部变量,onModuleDestroy 拿不到
```

**选：存为 class 属性**。

```ts
private pool: Pool;

async onModuleInit() {
  this.pool = new Pool({ connectionString: databaseUrl });
  this.db = drizzle(this.pool, { schema });
}

async onModuleDestroy() {
  await this.pool.end();
}
```

### 决策 2 · 要不要加超时？

```ts
// 方案 A:直接 await pool.end()
async onModuleDestroy() {
  await this.pool.end();
}

// 方案 B:加 5 秒超时,防止卡死
async onModuleDestroy() {
  await Promise.race([
    this.pool.end(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('pool.end() timeout')), 5000)),
  ]);
}
```

**选 A**。理由：
- `pool.end()` 本身会等待活跃查询完成
- NestJS 的 `enableShutdownHooks` 有内置超时（默认 10 秒）
- 保持简单，不加额外复杂度

---

## §4. 动手：auth-service

### Step 1 · main.ts 加 enableShutdownHooks

```ts
// apps/auth-service/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // ← 新加
  // ... 其余不变
}
```

### Step 2 · 验证 Redis 清理已生效

auth-service 的 `redis.service.ts` 已经有 `onModuleDestroy`：

```ts
// apps/auth-service/src/redis/redis.service.ts (已有代码,不用改)
async onModuleDestroy() {
  this.logger.warn('Redis disconnecting...');
  this.client.disconnect();
}
```

加了 `enableShutdownHooks()` 后，这段代码**不再是死代码**。

---

## §5. 动手：form-service

### Step 1 · main.ts 加 enableShutdownHooks

```ts
// apps/form-service/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // ← 新加
  // ... 其余不变
}
```

### Step 2 · drizzle.service.ts 存 pool + 加 OnModuleDestroy

```ts
// apps/form-service/src/database/drizzle.service.ts
@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  public db!: NodePgDatabase<Schema>;
  private pool!: Pool;  // ← 新加,存为属性

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.getOrThrow<string>('DATABASE_URL');
    this.pool = new Pool({ connectionString: databaseUrl });  // ← 改用 this.pool
    this.db = drizzle(this.pool, {
      schema: { /* ... */ },
    });
  }

  async onModuleDestroy() {  // ← 新加
    await this.pool.end();
  }
}
```

---

## §6. 动手：search-service

### Step 1 · main.ts 加 enableShutdownHooks

```ts
// apps/search-service/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // ← 新加
  // ... 其余不变
}
```

### Step 2 · elasticsearch.service.ts 加 OnModuleDestroy

```ts
// apps/search-service/src/elasticsearch/elasticsearch.service.ts
@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  // ... 现有代码不变

  async onModuleDestroy() {  // ← 新加
    await this.client.close();
  }
}
```

---

## §7. 动手：sync-service

### Step 1 · main.ts 加 enableShutdownHooks

```ts
// apps/sync-service/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();  // ← 新加
  // ... 其余不变
}
```

### Step 2 · sync.service.ts 加 OnModuleDestroy

```ts
// apps/sync-service/src/sync/sync.service.ts
async onModuleDestroy() {  // ← 新加
  await this.client.close();
}
```

---

## §8. Quiz

**Q1: 没有 enableShutdownHooks() 时，onModuleDestroy 会触发吗？**

A) 会，NestJS 默认就会监听 SIGTERM
B) 不会，需要显式调用 enableShutdownHooks() 才会触发
C) 只在生产环境会触发

**Q2: 生命周期顺序是什么？**

A) onModuleDestroy → onApplicationShutdown
B) onApplicationShutdown → onModuleDestroy
C) 同时触发

**Q3: form-service 的 pool 为什么要存为 class 属性？**

A) 为了性能更好
B) 因为 onModuleDestroy 需要访问 pool 来调 pool.end()
C) NestJS 要求所有属性都是 class 属性

---

## §9. Commit Message

```
feat: 0026 enableShutdownHooks + 连接清理

- 4 个 service 加 enableShutdownHooks() (auth/form/search/sync)
- form-service: drizzle.service.ts 存 pool 为属性 + OnModuleDestroy
- search-service: elasticsearch.service.ts 加 OnModuleDestroy
- sync-service: sync.service.ts 加 OnModuleDestroy
- 21 测试还过
```

---

## §10. 跨节链接

- [0025 · AllExceptionsFilter + 业务异常](./0025-exception-filters-and-error-classification.md) — 上一课
- [0003 · 进程生命周期](./0003-process-lifecycle.md) — SIGTERM / SIGINT 基础
- [0027 · JWT 深入](./0027-jwt-deep-dive.md) — 下一课
