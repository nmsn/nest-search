# 0060 · NestJS 依赖注入 Scope 进阶

> Phase D 第 6 课。NestJS 注入有 3 种 scope，**本节讲什么时候用、怎么用、有什么坑**。

## 你今天会拿到什么

1. 理解 **3 种 scope**（Singleton / Request / Transient）
2. 理解 **Request scope 的性能代价**
3. 理解 **AsyncLocalStorage** 替代方案
4. nest-search 实际场景分析
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 NestJS 注入的疑问

```
NestJS 默认:
  - Provider 都是 Singleton
  - 整个应用生命周期单例
  - 性能最好

但有时:
  - 想要每个请求一个新的实例
  - 想要跟特定请求绑定的数据
  - 想要"临时"实例

→ scope 机制
```

### 1.2 nest-search 当前 scope

```
当前: 全是 Singleton
  - 5 个服务, 性能好
  - 没有 request scope 需求
  - 没有 transient 需求

未来:
  - 加租户隔离 → 可能需要 request scope
  - 加复杂权限 → 可能需要 request scope
  - 加临时统计 → 可能需要 transient
```

---

## §2. 3 种 Scope

### 2.1 概念

```ts
// 1. Singleton (默认) - 单例
@Injectable()
export class UserService {
  // 整个应用一个实例
  // 所有请求共享
  // 性能最好
}

// 2. Request - 每个请求一个新实例
@Injectable({ scope: Scope.REQUEST })
export class TenantService {
  // 每个 HTTP 请求一个实例
  // 请求结束销毁
  // ⚠️ 性能差
}

// 3. Transient - 每次注入都新实例
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  // 每次 @Inject 都新实例
  // 立即创建, 用完可丢
  // ⚠️ 谨慎用
}
```

### 2.2 生命周期

```
Singleton:
  应用启动 → 创建 → 应用结束销毁
  所有请求共享同一个实例
  性能: ⭐⭐⭐⭐⭐ (最佳)

Request:
  请求到达 → 创建 → 请求结束销毁
  每个请求独立实例
  性能: ⭐⭐ (差, 每次请求要 new)

Transient:
  @Inject 触发 → 创建 → 不被引用时被 GC
  每次注入都 new
  性能: ⭐ (最差, 反复创建)
```

### 2.3 对比

| 维度 | Singleton | Request | Transient |
|------|-----------|---------|-----------|
| 实例数 | 1 | 每个请求 1 个 | 每次注入 1 个 |
| 内存占用 | 最小 | 较大 | 不定 |
| 性能 | 最快 | 慢 | 最慢 |
| 状态隔离 | ❌ 共享 | ✅ 隔离 | ✅ 隔离 |
| 适合 | 默认 | request-scoped 数据 | 临时工具 |
| 风险 | 共享状态污染 | 性能 | 内存泄漏 |

---

## §3. Request Scope 详解

### 3.1 是什么

```ts
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private requestId: string;
  private userId: number;
  private tenantId: string;
  
  constructor(@Inject(REQUEST) private req: Request) {
    this.requestId = req.headers['x-request-id'];
    this.userId = req.user?.id;
    this.tenantId = req.user?.tenantId;
  }
}
```

**典型场景**：
```
- 多租户系统 (每个租户独立数据)
- 请求日志 (每个请求的 requestId 链路追踪)
- 临时状态 (每个请求的中间结果)
```

### 3.2 怎么用？

```ts
// controller
@Controller('api/products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly context: RequestContextService,  // request scope
  ) {}

  @Get()
  list() {
    // 直接访问
    return this.productService.findForTenant(this.context.tenantId);
  }
}
```

### 3.3 关键限制：传递性

```
⚠️ Request scope 是"传染"的
如果 Service A 是 request scope
那么注入 A 的 B (即使是 singleton) 也变成 request scope

示例:
  Controller (request) 
    → ServiceA (singleton, 但因被 request controller 注入, 实际也是 request)
      → ServiceB (singleton, 同理)
```

**影响**：整个依赖链都变 request scope, 性能大幅下降。

### 3.4 性能代价（实测）

```
Singleton:
  1000 并发 → 1 个 ProductService 实例
  内存: ~5MB

Request:
  1000 并发 → 1000 个 ProductService 实例
  内存: ~5GB  (×1000)
  GC 压力: 极大

→ 几乎所有 NestJS 项目都用 Singleton
→ Request scope 是"不得已"才用
```

---

## §4. AsyncLocalStorage（推荐方案）

### 4.1 问题

```
需求:
  - 每个请求有独立 context (userId, requestId, tenantId)
  - 但不想用 Request scope (性能差)
  - 不想每个方法都传参数

解决: AsyncLocalStorage (Node.js 原生)
```

### 4.2 AsyncLocalStorage 概念

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

// 创建全局 store
const asyncLocalStorage = new AsyncLocalStorage<{ userId: number; requestId: string }>();

// 1. 在中间件里设置 store
app.use((req, res, next) => {
  asyncLocalStorage.run(
    { userId: req.user?.id, requestId: req.headers['x-request-id'] },
    () => next()  // 后续所有异步调用都能拿到
  );
});

// 2. 在任何地方读取
function getCurrentUser() {
  const store = asyncLocalStorage.getStore();
  return store?.userId;
}
```

**核心**：
- 不需要 request scope
- 跨所有异步调用
- 性能高（不创建实例）
- Node.js 原生支持

### 4.3 nest-search 当前用

```
nest-search 当前: PinoLogger
  - 用 AsyncLocalStorage 跟踪 requestId
  - 跨整个请求链路
  - 性能好

@InjectPinoLogger(SyncFullConsumer.name)
private readonly logger: PinoLogger
// logger 内部自动带 requestId
```

**这就是 AsyncLocalStorage 的实际应用**。

---

## §5. Transient Scope 详解

### 5.1 什么时候用

```
✅ 适合:
  - 临时工具对象 (Context 工具类)
  - 不需要状态
  - 每次调用想"全新"

❌ 不适合:
  - 长期持有的对象
  - 共享状态的对象
```

### 5.2 nest-search 例子

```ts
@Injectable({ scope: Scope.TRANSIENT })
export class RequestTracer {
  // 每次注入都新实例
  // 用于"trace 当前请求的链路"
  // 用完即丢, 不占内存
}
```

### 5.3 性能警告

```
1000 并发:
  Transient 注入 5 次 → 5000 个实例
  内存爆炸

慎用!
```

---

## §6. 实战案例

### 6.1 nest-search 多租户（未来）

```
需求: 加租户隔离, 不同租户只能看自己数据

❌ 方案 1: Request scope (性能差)
  @Injectable({ scope: Scope.REQUEST })
  export class TenantContext { ... }

✅ 方案 2: AsyncLocalStorage (推荐)
  const als = new AsyncLocalStorage();
  // 中间件设置, 业务代码读取
  
✅ 方案 3: 显式传 (NestJS 传统)
  // 业务方法第一个参数: tenantId
  // 显式, 不依赖隐式 context
```

### 6.2 nest-search 链路追踪（当前）

```
当前: PinoLogger 用 AsyncLocalStorage
  - 每个请求有 requestId
  - 跨 service 调用自动带上
  - 日志关联
```

### 6.3 什么时候用 request scope?

```
✅ 用 Request scope 当:
  - 真的每个请求需要独立实例
  - 实例里有可变状态
  - 不在乎性能
  - 用的服务数量少

❌ 不用 Request scope 当:
  - 只是为了拿 request 里的数据 → 用 AsyncLocalStorage
  - 整个调用链都用 → 性能爆炸
  - 不需要隔离 → 默认 singleton
```

---

## §7. 设计决策

### 决策 1 · 选哪个 scope?

```
决策树:
  需要每个请求独立数据吗?
    → 是, 只是读 → AsyncLocalStorage ✅
    → 是, 还要修改 → Request scope ⚠️
    → 否 → Singleton ✅ 默认
```

### 决策 2 · nest-search 实际

```
nest-search 当前:
  - 全 Singleton
  - 用 AsyncLocalStorage 跟踪 requestId (PinoLogger)
  - 性能最佳

未来加多租户:
  - 选 AsyncLocalStorage
  - 不选 Request scope
```

---

## §8. nest-search 实测

```
业务代码:
  - Controller: Singleton
  - Service: Singleton
  - Guard: Singleton
  - Pipe: Singleton
  - Filter: Singleton
  - Middleware: Singleton
  - Provider: Singleton
  - Interceptor: Singleton

→ 全部 Singleton
→ 性能最优
→ 数据隔离靠"显式传参"或 AsyncLocalStorage
```

---

## §9. Quiz

**Q1: NestJS 默认 scope 是什么？**

A) Request
B) Singleton
C) Transient

**Q2: Request scope 最大的缺点？**

A) 内存占用大, 性能差（传染性）
B) 容易出 bug
C) 不支持 async

**Q3: nest-search 的 requestId 怎么实现的？**

A) Request scope
B) AsyncLocalStorage (PinoLogger)
C) 显式传参

---

## §10. Commit Message

```
docs(teaching): 0060 NestJS DI scope 进阶

- Singleton / Request / Transient 3 种对比
- Request scope 传染性问题 + 性能代价
- AsyncLocalStorage 替代方案
- nest-search 实际: 全 Singleton + PinoLogger 用 ALS
- 21 测试还过
```

---

## §11. 跨节链接

- [0059 · 文件上传](./0059-file-upload-s3.md) — 上一课
- [0061 · API 版本控制](./0061-api-versioning.md) — 下一课
- [request-context.service.ts](../../libs/shared/src/als/request-context.service.ts) — ALS 实现
