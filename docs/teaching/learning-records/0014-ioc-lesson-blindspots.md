# 0014 — 0010 IoC 容器 lesson 盲点 + Provider 三件套 best practice

> 0010 lesson 写完、quiz 3/3 后,这一篇专门记录 lesson 本身的盲点和"工业级 Provider 三件套"。

## 0010 lesson 的 3 个盲点

### 盲点 1(轻):Provider 4 种写法对比表没有完整"何时用"指引

Lesson §1 给了 4 种写法的对比表,但每种"什么时候用"只是简单一句话。需要补一个决策树:

```
要注入的是 class?
├─ 是,默认写法  → class
└─ 不是,需要一个值?
   ├─ 是静态值 → useValue
   └─ 是动态计算 → useFactory
需要同一 instance 多个 token?
└─ 是 → useExisting
需要根据条件切换实现?
└─ 是 → useClass(条件表达式)
```

**Lesson 设计原则**:**任何"几个 option"对比表,必须配决策树**。光给表不给决策树,用户学了不会用。

### 盲点 2(中):Scope 传染性没讲清楚根因

Lesson §4 提到 "request scope 传染性"但没说**为什么会传染**。

**传染机制**(tgc emit 出来的代码):
```js
// BarService 编译后:
Reflect.defineMetadata(
  'design:paramtypes',
  [FooService],     // ← BarService 构造需要 FooService
  BarService
);
```

NestJS 启动时:
1. 看到 BarService 构造要 FooService
2. 查 FooService scope
3. 发现 FooService 是 REQUEST
4. "那 BarService 必须是 REQUEST 才能拿到对应 instance"
5. BarService 自动传染变 REQUEST

**Lesson 设计原则**:**讲"现象"必须讲"机制"**。只说"传染"不说"为什么"会传染,用户遇到问题不知道怎么排查。

### 盲点 3(中):HttpClientService 重构后没解释 "为什么能同时去掉 REQUEST 注入和 forwardedHeaders"

Lesson §5 改了 ProxyService,删了 REQUEST 注入和 forwardedHeaders。**没说"为什么能删"**:

- `forwardedHeaders` 之前 ProxyService 自己拼 → HttpClientService 替它拼(REQUEST 还在 HttpClientService 里)
- `REQUEST` 之前 ProxyService 直接拿 → HttpClientService 拿(然后 ProxyService 不需要了)

**真正的好处**:**所有出站请求的"加 header"逻辑集中到一处**。以后要加 `Authorization` 头,只改 HttpClientService 一个文件。

**Lesson 设计原则**:**重构 lesson 必须说"重构前 vs 重构后"的对比**,用户看到"代码短了"但不知道为什么可以删。

---

## 工业级 Provider 三件套(best practice)

0010 学完后,**任何 NestJS service 的标准写法**应该是:

```ts
// 1. 用 @Injectable() 标
@Injectable()
export class CartService {}

// 2. 构造参数都用 type,不用 @Inject(token)(type 自动注入)
constructor(
  private db: DatabaseService,
  private logger: LoggerService,
  private httpClient: HttpClientService,   // ← HttpClientService 也是普通 DI
) {}

// 3. 不在构造里做 IO,逻辑都在 method 里
async getItems() {
  return this.db.query('SELECT ...');   // ← DB 在 method 里调用,不在构造
}
```

**避免的反模式**:

```ts
// ❌ 反模式 1:构造里做 IO
constructor() {
  this.data = fs.readFileSync('./config.json');   // ← 启动时阻塞
}

// ❌ 反模式 2:用 @Inject 注入 string token(应该用 type)
constructor(@Inject('CONFIG') private config: any) {}

// ❌ 反模式 3:Scope.REQUEST 默认(应该是 singleton)
@Injectable({ scope: Scope.REQUEST })  // ← 99% 不需要
```

## nest-search 当前 Provider 改造进度

| service | 当前写法 | 改造方向 |
|---|---|---|
| ProxyService | ✅ 重构完(用 HttpClientService) | 完成 |
| HttpClientService | ✅ 新建(useFactory 模式) | 完成 |
| TimingInterceptor | ✅ standard | 无 |
| LifecycleProbeService | ✅ standard | 无 |
| AllExceptionsFilter | ✅ standard | 无 |
| All guards | ✅ standard | 无 |

**gateway 的 Provider 改造 = 0010 完成**。

下一个 Provider 改造在 **0014 Module 系统深入**(可能涉及把 service 拆 module,可能涉及 useFactory 模式做 ConfigService 的注入)。

## Implications for next sessions

| 课 | 引用本 LR 的章节 |
|---|---|
| 0011 AOP | Provider 4 种写法(useFactory 用于动态 guard) |
| 0014 Module 系统 | Scope 传染性(module 拆 scope 时特别重要) |
| 0018 REST 最佳实践 | HttpClientService interceptor 模式 |

## 给 principles 轨道 lesson 的"通用盲点 checklist"

每节 lesson 写完后,问这 3 个问题:

1. **决策树补了没?**(多个 option 必须配"什么时候用")
2. **机制讲了没?**(讲现象必须讲机制 — 为什么 / 怎么工作)
3. **重构前后对比清楚没?**(改的代码必须让用户看到"为什么能这样改")

0010 lesson 在这 3 项都**部分缺失**,LR-0014 补全了。

## 关键 stat(0010 实际跑通)

| 维度 | 数量 |
|---|---|
| Quiz 满分 | 3/3(连续 8 节) |
| 真实工程坑已修 | 1(0008 留的"手写 forwardedHeaders"清掉) |
| 真实工程坑保留 | 0(gateway 改完干净) |
| lesson 盲点 | 3(本 LR) |
| 工业级 best practice | 1 套(Provider 三件套) |