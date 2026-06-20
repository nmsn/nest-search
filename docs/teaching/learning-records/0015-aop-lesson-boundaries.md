# 0015 — AOP 边界感 + naming collision + lesson 盲点(0011)

> 0011 lesson 跑通,RolesGuard 工作,但这次暴露了几个值得记录的 lesson 设计盲点。

## 盲点 1:HttpClientService 的 method/property 命名冲突(lesson 0010 留)

**症状**(0011 hands-on 触发):
```
apps/gateway/src/proxy/proxy.service.ts:37:36
- error TS2341: Property 'request' is private
```

**根因**(`http-client.service.ts`):
```ts
@Inject(REQUEST) private readonly request: Request,    // 属性:Request 对象
async request<T>(config): Promise<T> { ... }            // 方法:发 HTTP 请求
```

**TypeScript 解析 `this.httpClient.request(...)` 时,优先匹配到 private 属性,报错**。哪怕方法存在,属性"先到先得"。

**修法**:把属性改名(保留 method 名 `request`,跟 @nestjs/axios 风格一致):
```ts
@Inject(REQUEST) private readonly currentRequest: Request,
async request<T>(config): Promise<T> { ... }
// 方法内引用改成: this.currentRequest.id
```

**Lesson 设计原则**:
- **method 名和 property 名永远不要相同**(即便 TS 允许)
- 跟 IO/框架交互的 method 跟内部 property 命名空间分开
- 推荐:property 用 `currentXxx` / `incomingXxx`,method 用动词(`forward` / `request` / `execute`)

**未来 lesson 提示**:0014 Module 重构 HttpClientService 时,顺手检查命名规范。

## 盲点 2:quiz 边界感模糊(1/3 错题分析)

0011 quiz 是 8 节满分后的第一次 1/3。**这次不是 quiz 设计有问题,是 lesson 设计的"边角"漏了**。

### Q1 错:401 vs 403

**用户选 401(Unauthorized)**,**正确 403(Forbidden)**。

**lesson 里的原话**:
> 返回 false → 请求被拒(**默认 403 Forbidden**)

**用户大概率没看到"默认"二字**,凭直觉选了 401。

**Lesson 设计原则**:**精确区分的边界概念,单独成块,不能塞在长段落里**。

```
❌ lesson 写法(在长段落里):
  "Guard 返回 true → 通过,返回 false → 拒(默认 403)。"
  (用户一扫而过,记成"拒")

✅ 改进写法(单独成块):
  HTTP Status 语义:
  ┌─────────────────────────────────────────┐
  │  401 Unauthorized   还没证明你是谁        │
  │                    (CasGuard / ApiKeyGuard)│
  │  403 Forbidden      你已经认证了,但没权限 │
  │                    (RolesGuard)            │
  └─────────────────────────────────────────┘
  Guard 默认 403,因为 RolesGuard 之前必过 CasGuard。
```

### Q2 错:Express vs NestJS Request

**用户选"NestJS 自己的 Request"**,**正确"Express 那个 Request"**。

**NestJS 没有自己的 Request 类型**。`switchToHttp().getRequest()` 返的是底层 adapter 的 Request(默认 Express,可换 Fastify)。

**Lesson 设计原则**:**框架层次感必须画清楚**。

```
❌ lesson 写法(只说"Request"):
  switchToHttp().getRequest()  // 拿 Request

✅ 改进写法(画层次图):
  ┌─────────────────┐
  │ 你的代码         │
  │  (NestJS 框架层)│
  ├─────────────────┤
  │ switchToHttp()   │  ← NestJS 抽象
  ├─────────────────┤
  │ getRequest()     │  ← NestJS 调用 adapter
  ├─────────────────┤
  │ Express / Fastify│  ← 真正的 HTTP 解析
  └─────────────────┘
  拿到的是 Express 的 req(或 Fastify 的)
```

## 跨节共性:9 节 principles 教训

```
0010: 4 种 Provider 写法的对比表没配决策树  → LR-0014
0010: scope 传染性的"为什么"没讲            → LR-0014
0011: 401/403 这种"边界值"概念跟主概念混在一起 → LR-0015
0011: NestJS/Express 这种"框架层次"没画图     → LR-0015
0011: method/property 同名不报错但有陷阱       → LR-0015
```

**未来 lesson 设计的 5 个 mental check**(累计到 5 个):
1. 多个 option 是否配决策树?(0010)
2. 讲现象是否讲机制?(0010)
3. 重构前后是否说清楚?(0010)
4. **边界值是否单独成块?(0011 新增)** ← 401 vs 403 这种
5. **框架层次是否画图?(0011 新增)** ← NestJS vs Express 这种

## 给 0012 Module 系统的 lesson 设计提示

0012 是 principles 轨道的最后一课。**前置 checklist**:
- [ ] 复习 LR-0012(10 个问答 Module/DI primer)— 必读
- [ ] 复习 LR-0013 + LR-0014 + LR-0015(盲点列表)— 写新 lesson 时随时回头看
- [ ] 边界概念(spec 写法差异 / module 嵌套 / forwardRef)必须单独成块,不能塞段落
- [ ] 框架层次图必须画(Module / Provider / 装饰器 的关系图)

## 关键 stat(0011 收口)

| 维度 | 数量 |
|---|---|
| Quiz | 1/3(8 节满分断在这里) |
| lesson 真实 bug | 1(命名冲突,0010 留的) |
| lesson 设计盲点 | 2(401/403 + NestJS/Express) |
| 真实工程坑已修 | 1(命名冲突,改 currentRequest) |
| 真实工程坑保留 | 0 |