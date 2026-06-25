# 0028 · 健康检查深度：liveness vs readiness + 自定义 indicator

> Phase A 第 10 课。0027 做完 JWT 深入,0028 补健康检查：**liveness vs readiness 区分** + **自定义 indicator**（DB/Redis/ES 连接检查）。

## 你今天会拿到什么

1. 理解 **liveness vs readiness** 的区别（不是同一个东西）
2. 亲手给 auth-service 加 **readiness probe**（检查 PG + Redis 连接）
3. 理解 **企业级健康检查**的标准（Kubernetes 怎么用这两个端点）
4. 了解 **@nestjs/terminus** 的用法
5. 21 测试还过 + 1 个 commit

---

## §1. liveness vs readiness

```
Kubernetes / Docker 的健康检查有两种：

liveness (存活探针)
├── 问题: "这个进程还活着吗？"
├── 失败: 重启容器
└── 场景: 进程卡死、死锁、内存泄漏

readiness (就绪探针)
├── 问题: "这个服务能处理请求吗？"
├── 失败: 从负载均衡摘除(不重启)
└── 场景: DB 连接断开、Redis 不可用、依赖服务挂了
```

**关键区别**：

| | liveness | readiness |
|---|---------|-----------|
| 失败后果 | **重启**容器 | **摘除**流量 |
| 检查什么 | 进程是否卡死 | 依赖是否可用 |
| 端点 | `/health/live` | `/health/ready` |

**反模式**（不要这样做）：

```ts
// ❌ liveness 检查 DB 连接
// 如果 DB 临时不可用 → K8s 不断重启容器 → 雪崩
@Get('health')
check() {
  await this.db.query('SELECT 1');  // DB 挂了 → 500 → K8s 重启
}
```

```ts
// ✅ 正确分开
@Get('health/live')
live() {
  return { status: 'ok' };  // 进程活着就行
}

@Get('health/ready')
async ready() {
  const dbOk = await this.checkDb();
  const redisOk = await this.checkRedis();
  return { status: dbOk && redisOk ? 'ok' : 'error', db: dbOk, redis: redisOk };
}
```

---

## §2. @nestjs/terminus

NestJS 官方健康检查库，提供 `HealthCheck` 装饰器 + 各种 indicator。

```bash
pnpm add @nestjs/terminus
```

```ts
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
```

**但 nest-search 用 Drizzle 不用 TypeORM**，所以 `TypeOrmHealthIndicator` 不适用。我们需要写自定义 indicator。

---

## §3. 设计决策

### 决策 1 · 用不用 @nestjs/terminus？

```ts
// 方案 A:用 @nestjs/terminus + 自定义 indicator
优点:标准化,HealthCheck 装饰器自动记录
缺点:多一个依赖,Drizzle 没有官方 indicator

// 方案 B:手写 /health 端点
优点:简单,无额外依赖
缺点:没有标准化的健康检查框架
```

**选 B**。理由：
- nest-search 已经有 5 个 service，每个用不同的 DB/缓存
- 手写更灵活，不需要适配 terminus 的 indicator 接口
- 健康检查逻辑简单，不需要框架

### 决策 2 · 放在哪个 module？

```ts
// 方案 A:每个 service 自己的 health.controller.ts
优点:各 service 检查自己的依赖
缺点:重复代码

// 方案 B:放 gateway,检查所有下游 service
优点:集中监控
缺点:gateway 不知道各 service 内部状态
```

**选 A**。理由：
- 每个 service 知道自己的依赖
- K8s 的 readiness probe 是 per-pod 的
- gateway 的 health check 只检查自己（能否代理请求）

---

## §4. 动手：auth-service 健康检查

### Step 1 · 创建 health module

```ts
// apps/auth-service/src/health/health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

### Step 2 · 创建 health controller

```ts
// apps/auth-service/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { DrizzleService } from '../database/drizzle.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const allOk = Object.values(checks).every(Boolean);

    return {
      status: allOk ? 'ok' : 'error',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.drizzle.db.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
```

### Step 3 · 在 app.module.ts 注册

```ts
// apps/auth-service/src/app.module.ts
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ... 现有 imports
    HealthModule,  // ← 新加
  ],
})
export class AppModule {}
```

---

## §5. 企业级健康检查标准

### Kubernetes 配置

```yaml
# deployment.yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 2
```

### 响应格式标准

```json
// liveness - 简单
{
  "status": "ok",
  "timestamp": "2026-06-25T12:00:00.000Z"
}

// readiness - 详细
{
  "status": "ok",
  "checks": {
    "database": true,
    "redis": true
  },
  "timestamp": "2026-06-25T12:00:00.000Z"
}

// readiness 失败
{
  "status": "error",
  "checks": {
    "database": false,
    "redis": true
  },
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### HTTP 状态码

```
liveness:  永远 200 (进程活着)
readiness: 200 (就绪) 或 503 (未就绪)
```

---

## §6. Quiz

**Q1: liveness 和 readiness 的区别是什么？**

A) liveness 检查 DB,readiness 检查 Redis
B) liveness 失败重启容器,readiness 失败摘除流量
C) 没有区别,可以互换

**Q2: 为什么 liveness 不应该检查 DB 连接？**

A) 因为 DB 检查太慢
B) 因为 DB 临时不可用时不应该重启容器,重启也解决不了 DB 问题
C) 因为 liveness 只检查 CPU

**Q3: readiness 检查失败时 HTTP 状态码应该返回什么？**

A) 200
B) 500
C) 503

---

## §7. Commit Message

```
feat: 0028 liveness/readiness 健康检查

- 新增 health/ 目录 (health.module.ts + health.controller.ts)
- /health/live: 简单存活检查
- /health/ready: DB + Redis 连接检查
- app.module.ts 注册 HealthModule
- 21 测试还过
```

---

## §8. 跨节链接

- [0027 · JWT 深入](./0027-jwt-deep-dive.md) — 上一课
- [0029 · Phase B 开始](./0029-redis-deep-dive.md) — 下一课(Phase A 完成!)
- [0007 · 限流 + 健康检查基础](./0007-rate-limiting.html) — 0007 讲过基础
