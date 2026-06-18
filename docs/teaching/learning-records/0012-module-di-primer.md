# 0012 — Module / DI / IoC 入门小节(0009 课后问答集)

> 这是 principles 轨道第一课的"问答附录"。
> 0009 lesson 写了"装饰器与元数据"理论,但动手前**没有讲清楚** NestJS 的几个核心心智模型。
> 这一轮 8 个问答把这些心智模型装好,**0010 / 0014 / 0011 之前先看这一篇**。

---

## Q1. DI 是什么?@Injectable() 又是什么?

### DI(Dependency Injection)

**一句话**: 不要在类里 `new` 别人需要的依赖,**让外面"塞"进来**。

**没有 DI**:
```ts
class UserService {
  private db = new MysqlClient();           // ← 自己 new
  private logger = new ConsoleLogger();      // ← 自己 new
  // 想换 Mock?改源码。多个 service 共享同一 Redis?做不到。
}
```

**有 DI**:
```ts
class UserService {
  constructor(
    private db: MysqlClient,       // ← 外面塞进来
    private logger: LoggerService,
  ) {}
}
// 框架: const svc = new UserService(realDb, realLogger);
// 测试: const svc = new UserService(mockDb, mockLogger);
```

### IoC(Inversion of Control)

- **Control** = "谁来创建依赖"
- **Inversion** = 不在类里 new,**反**过来让框架 new
- **DI** = 框架 new 完,塞给类

**NestJS 的 IoC 容器**就是那个框架:看到 `@Injectable()`,读 `design:paramtypes` 知道依赖,递归创建所有依赖,`new` 出 instance,**塞**进类的 constructor。

### @Injectable()

**本身做的事 = 0**。只是告诉 NestJS"这个类归我管"。

**真正发生的事**:
1. tsc 编译时 `emitDecoratorMetadata: true` 自动 emit 一行:
   ```js
   Reflect.defineMetadata('design:paramtypes', [LoggerService, ConfigService], UserService);
   ```
2. 运行时 NestJS 看到 `@Injectable()` → 读 `design:paramtypes` → new LoggerService + ConfigService → new UserService(logger, config)

### 跟 React 类比(8 年前端)

| React | NestJS |
|---|---|
| `useContext` | `@Inject()` |
| Provider 塞值 | IoC 容器塞依赖 |
| Consumer 用值 | Service 用依赖 |

**核心都是"在树上某处声明,树深处自动拿到"**。

---

## Q2. @Injectable() 缺了会怎样?3 个条件要全满足

### @Injectable() 只是个"入场券",还要 2 个条件

```
1. @Injectable() 标"我归 NestJS 管"
   ↓
2. 在某 module 的 providers 数组里(被 NestJS "看得到")
   ↓
3. 那个 module 被 import(被 NestJS "找得到")
   ↓
4. 在别处 constructor 里引用(触发 NestJS 自动 new + 注入)
```

**4 个缺一不可**。

### 缺 1 后果(没 @Injectable())

新写 `BrokenService`(无 @Injectable),放进 providers,**启动报错**:

```
Nest can't resolve dependencies of the BrokenService (?). 
Please make sure that the argument LoggerService at index [0] is available 
in the AppModule context.
```

**本质**: NestJS 拒绝为"没标 @Injectable"的类做完整 DI 初始化,虽然能 new,但不能注入依赖。**启动直接挂**。

### 不归 NestJS 管的情况(纯工具类,不需要标)

```ts
class StringUtil {
  static toCamelCase(str: string): string { ... }   // 静态方法,不用 new
}
// 用法:StringUtil.toCamelCase()
```

这种不需要标 `@Injectable()`,因为根本不归 NestJS 管。

---

## Q3. CartService 应该在哪注册?feature module vs AppModule

### 一句话答案

**CartService 在 CartModule 的 `providers` 里,不在 AppModule**。

```
AppModule (根 module)
├── ConfigModule (全局)
├── LoggerModule (全局)
├── HealthModule
├── ThrottlerModule
├── AuthModule       ← 业务域 module
│   ├── providers: [AuthService, CasService]
│   ├── controllers: [AuthController]
│   └── exports: [AuthService]
└── CartModule       ← 业务域 module
    ├── providers: [CartService]
    ├── controllers: [CartController]
    └── exports: [CartService]
```

### 为什么这样设计

| 维度 | 在 AppModule.providers | 在 CartModule.providers |
|---|---|---|
| 加载时机 | 启动立即 | 启动立即 |
| 可被谁注入 | AppModule 及其 imports 的所有 module | 只 CartModule + import CartModule 的 module |
| 重用性 | 难(都耦合到根) | 易(整个 CartModule 拿出去就是微服务) |
| 启动时间拖累 | 所有 service 同时加载 | 可以 lazy(0014 讲) |
| 测试 mock | mock 整个 AppModule | mock CartModule 即可 |

### 3 层 module 结构(业界 best practice)

```
AppModule
├── CoreModule          (@Global,核心基础设施)
├── SharedModule         (跨域工具)
└── FeatureModule × N    (按业务域切分)
```

### 你 nest-search 当前状态

- AppController 里 20+ 个 handler 全堆一起
- AppModule providers 5+ 个 service 全部平铺

**小项目可接受,大项目要重构** — **到 0014 Module 系统深入,我们做真正的 module 化重构**。

---

## Q4. 跨 module 调 service 的 3 步

### 直接答案:**export + import + constructor 注入**

```ts
// cart.module.ts
@Module({
  providers: [CartService],
  controllers: [CartController],
  exports: [CartService],         // ← 1. 开门
})
export class CartModule {}

// business.module.ts
@Module({
  imports: [CartModule],         // ← 2. 拿到开门权
  providers: [BusinessService],
  controllers: [BusinessController],
})
export class BusinessModule {}

// business.service.ts
@Injectable()
export class BusinessService {
  constructor(
    private cartService: CartService,   // ← 3. 注入
  ) {}
}
```

### 嵌套 module 调用方式选择

| 场景 | 通信方式 |
|---|---|
| 同进程,不同 module | **直接 DI** |
| 不同进程(微服务) | HTTP / gRPC / 消息队列 |
| 多语言(Java + Node) | HTTP / gRPC |

**同进程永远用直接 DI**(快 10000 倍 + 类型安全 + 栈追踪 + 单测友好)。

**微服务化时才改 ClientProxy**(0026 课讲)。

---

## Q5. AppModule 必须显式 import 子 module

### "重复 import 不是问题"

```ts
// app.module.ts
imports: [CartModule, BusinessModule]   // ← 重复声明"我用了 CartModule"
business.module.ts
imports: [CartModule]                    // ← BusinessModule 也"用了 CartModule"
```

**CartModule 只会有 1 个 instance**(NestJS 模块 singleton,多次 import 不创建多实例)。

### 为什么 AppModule 必须 import

**exports 不是 transitive**:
```
CartModule exports [CartService]
   ↓
BusinessModule imports [CartModule], exports [BusinessService]
   ↓
AppModule imports [BusinessModule]
   ✗ AppModule 看不到 CartService(只有 BusinessService)
```

**AppModule 想直接用 CartService,必须显式 imports: [CartModule]**。

### 重复 import 的 4 个理由

1. **可读性**: `app.module.ts` 一眼看到"这个 app 用哪些 module"
2. **可重构**: `git grep CartModule` 一搜所有用到它的地方
3. **可避免循环依赖**: 显式让 NestJS 早期就能发现
4. **可独立测试**: 测试 module 时只 mock 它显式声明的依赖

### 业界 best practice

99% 选"显式 import 多次",少数选 "re-export"。

---

## Q6. Controller 不 export,只 `controllers: []` 列一次

### @Module 的 3 个数组

| 数组 | 管什么 | export 吗 |
|---|---|---|
| `controllers: [X]` | 把 controller 挂到 HTTP server(暴露路由) | ❌ 从不 |
| `providers: [X]` | 把 class 塞进 DI 容器 | ✅ 可 export |
| `exports: [X]` | 把 providers 列表里的某些"开门"给外部 | (是上面两个的子集) |

**Controller 是 module 的"内部资产",挂上去就路由暴露,没有"export 给别人"的语义**。

### 为什么 Controller 不 export

| 类 | 谁能用 | 为什么 |
|---|---|---|
| Service | 别的 module 用 `@Inject()` 注入 | 因为要"复用逻辑" |
| Controller | 没人"用"controller 的 method | controller 是 HTTP 入口,只服务"外部请求" |

### 反面例子(不要这么写)

```ts
@Module({
  imports: [CartModule],
  controllers: [CartController],   // ← 错!重复注册
  providers: [CartService],        // ← 错!重复 provider
})
export class AppModule {}

// 报错: Duplicate controller: CartController
```

### 一句话

> **Controller 在它归属的 module 的 `controllers` 数组里出现一次,AppModule 通过 `imports: [该 module]` 间接激活所有 routes。Controller 从不 export。**

---

## Q7. Module 不在 AppModule.imports = 死代码

### 直接验证

```ts
// cart.module.ts 写了
@Module({...})
export class CartModule {}

// app.module.ts 忘了加
@Module({
  imports: [/* 漏了 CartModule */],
})
export class AppModule {}
```

**后果**:
- 启动 OK(不报错)
- `curl /api/cart/items` 返 404
- `CartService` 永远不被 new
- `exports` 写了但没人用,无效

### React 类比

```jsx
// React: App.tsx 没 import,组件就是死代码
import Cart from './Cart';   // ← 不 import,Cart 永远不渲染
export default function Cart() { ... }   // 文件在,但没人用
```

**NestJS 一模一样**。AppModule 是 NestJS 的 "App.tsx"。

### 怎么避免"忘了 import"

- 写 CartModule 完,**立即**在 AppModule.imports 加
- `cart.module.ts` 顶部加注释:`// TODO: 记得 import 到 app.module.ts`
- 0014 教一个 `grep -r "@Module"` 自动检测孤儿 module 的脚本

---

## Q8. reflect-metadata 是什么

### 一句话

**Polyfill**,给 V8/Node 增加"在 JavaScript 对象上贴标签"的能力(`Reflect.defineMetadata` / `Reflect.getMetadata`)。TypeScript 装饰器工作的前提。

### 关键事实

- V8 / Node **不内置**(规范没要求)
- 必须装 `reflect-metadata` 包(每个 NestJS 项目都有)
- NestJS 依赖它做 2 件事:
  - `design:paramtypes` — 自动 DI 读构造函数参数类型
  - 框架自定义 key(`path` / `method` 等) — 路由 / Guard / Pipe 读 metadata

### NestJS 用了哪些 key

| key | 谁写 | 谁读 |
|---|---|---|
| `design:paramtypes` | tsc 自动 emit | NestJS IoC 容器 |
| `design:type` | tsc 自动 emit | NestJS(诊断) |
| `design:returntype` | tsc 自动 emit | NestJS(诊断) |
| `path` | `@Get('/x')` | Express router |
| `method` | `@Get/@Post` | Express router |
| `isPublic` | `@Public()` | ApiKeyGuard |
| `roles` | `@Roles(...)` | (0011 RolesGuard 读) |

---

## Q9. @Module 的 4 个字段 + @Global() + DynamicModule

### 完整 `ModuleMetadata` type

```ts
interface ModuleMetadata {
  imports?: Array<
    Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;
  controllers?: Array<Type<any>>;
  providers?: Array<Provider>;
  exports?: Array<
    string | symbol | Type<any> | DynamicModule | ForwardReference
  >;
}
```

### 4 个字段速查

| 字段 | 作用 | 常见误用 |
|---|---|---|
| `imports` | 声明依赖的 module | 忘了 → 死代码 |
| `controllers` | 归这个 module 的 controller | 重复声明 → 启动报错 |
| `providers` | 可注入的 class | 跟 exports 混淆 |
| `exports` | 给外部用的白名单 | 默认全 export → 错,得显式列 |

### 4 个字段**之外**

| 概念 | 作用 | 哪节课 |
|---|---|---|
| `@Global()` | 让 exports 全 app 可见 | 0014 |
| `DynamicModule` | 可配置参数的 module | 0010 |
| `forRoot / forFeature` | DynamicModule 的常见 API | 0010 |
| `ModuleRef` | 手动从容器取 instance | 0010 |
| Provider 的 4 种形式 | class / useValue / useClass / useFactory | 0010 |
| `forwardRef` | 解决循环依赖 | 0014 |

### 三节课把 NestJS 三件套讲完

- **0010 讲 providers 维度** — 4 种 Provider + useFactory + ModuleRef
- **0014 讲 module 维度** — imports / exports / @Global / DynamicModule / 循环依赖
- **0011 讲 AOP 维度** — Guard / Pipe / Interceptor / Filter

---

## Q10. 跨进程 vs 同进程通信

### 一句话决策

**同进程,直接 DI;跨进程,网络协议**。

### 判断标准:两个 service 在不在同一进程?

| 场景 | 部署 | 通信方式 |
|---|---|---|
| 同一 app,不同 module | 1 个 Node 进程 | **直接 DI** |
| 同一 app,想解耦 | 1 个 Node 进程 | 直接 DI + `@Global()` |
| 微服务 | 多个 Node 进程 | HTTP / gRPC / 消息队列 |
| 多语言(Java + Node) | 多个进程 | HTTP / gRPC |

### nest-search 现状是 monolith → 直接 DI 永远对

### 微服务化时怎么改

```ts
// 改前(直接 DI)
constructor(private cartService: CartService) {}   // ← 同进程

// 改后(微服务)
constructor(@Inject('CART_SERVICE') private cartClient: ClientProxy) {}
async checkout() {
  const items = await firstValueFrom(
    this.cartClient.send({ cmd: 'get_items' }, { userId: '...' })
  );
}
```

**用 NestJS Microservices transport**(TCP / Redis / RabbitMQ / Kafka)。0026 课讲。

---

## 跨节共性:这 10 个问答覆盖的"principles 入门"心智模型

```
NestJS 应用 = Module 树
        ↓
Module = providers + controllers + exports + imports(4 个字段)
        ↓
DI = NestJS 读 design:paramtypes + @Injectable 标记 + new + 注入
        ↓
Module 之间通信 = exports + imports + constructor 注入
        ↓
跨进程 = ClientProxy(TODO 0026)
```

**到 0010 之前看这一篇,0010 之后会"恍然大悟"**。

## 跟 LR-0009 的关系

- **LR-0009** = 0009 lesson 的"实战观察"(decorators + @Roles refactor)
- **LR-0012**(本篇)= 0009 lesson 的"问答附录"(Module/DI 入门)

**两者一起**,0010 / 0014 / 0011 之前的完整前置知识。

## Implications for next sessions

| 课 | 引用本 LR 的章节 |
|---|---|
| 0010 IoC | Q1 (DI), Q2 (@Injectable 缺了), Q9 (Provider 4 种形式) |
| 0011 AOP | Q8 (reflect-metadata), Q9 (Provider token 形式) |
| 0014 Module 系统 | Q3 (CartService 在哪), Q5 (重复 import), Q6 (Controller 不 export), Q7 (死代码), Q9 (@Global + DynamicModule) |

---

## Lesson 设计反思(这次对话让我学到的)

8 个问答是 lesson 设计没覆盖到的"心智模型" — 这些**应该**写进 0009 lesson,但 lesson 当时只讲了"装饰器原理"。

**未来 lesson 设计原则**:
1. 每节 lesson 写完,**自查 5 个最常见的"对术语不熟"问题**(DI / @Injectable / Module 关系 / provider 形式 / 跨进程 vs 同进程)
2. 如果 Q&A 不能用 lesson 现有内容回答,**lesson 缺这块内容**
3. 把 Q&A 收集成"lesson 附录",不是删问题,是把它们变成参考

**这次对话就是 0009 lesson 缺的"附录"**。