# 0013 — 0009 装饰器原理课盲点 + 写一个真实 LR 而非 lesson 修正

> 0009 lesson 写完、跑通、quiz 3/3 后,这一篇**专门记录 lesson 本身的盲点**。
> 跟 LR-0012(Module/DI 心智模型)互补 — 那一篇是"用户问什么",这一篇是"lesson 写漏什么"。

## 0009 lesson 4 个盲点(按严重程度)

### 盲点 1(严重):5.3 验证步骤被 guard 挡

**lesson 原本写的 5.3**:
```ts
// 在 syncFull 函数体里加 console.error
console.error('[syncFull] roles metadata:', Reflect.getMetadata('roles', this.syncFull));
// 然后 curl /api/sync/full/ds 触发
```

**问题**:`syncFull` 之前有 `@UseGuards(AdminGuard)`,Guard 在 handler 之前拒绝请求 → handler 不跑 → console.error 永远不触发。

**用户实际体验**:发 curl → 401(Guard 拒绝)→ 看不到 metadata → 卡住。

**修法**:换成 script 验证,不走 HTTP 不走 guard:
```ts
// apps/gateway/src/decorators-demo/check-roles.ts
Reflect.getMetadata('roles', AppController.prototype.syncFull)
```

**Lesson 设计原则**:**任何 "verify 一下" 步骤都要绕开 production 路径**。验证 metadata 不应该触发 production guard;验证 type 不应该编译完整 app;验证 DB schema 不应该启动服务。

### 盲点 2(中):示例代码 `console.error('...', syncFull)` 引用了未定义变量

**原代码**:
```ts
console.error('[syncFull] roles metadata:', Reflect.getMetadata('roles', syncFull));
//                                                                          ^^^^^^^^^
//                                                                          未定义!
```

`syncFull` 在函数体内是**未定义标识符** — 它是 class method,不是局部变量。TypeScript 编译不报错(prototype 上有),但运行时抛 `ReferenceError`。

**修法**:
```ts
Reflect.getMetadata('roles', this.syncFull)
// 或 Reflect.getMetadata('roles', AppController.prototype.syncFull)
```

**Lesson 设计原则**:**示例代码里所有标识符必须"真实可解析"**。`this.method` 或 `Class.prototype.method`,不用裸 `method`。用户复制粘贴要直接能跑。

### 盲点 3(轻):`RequestMethod` 数字 enum 没解释

**用户跑 script 看到的输出**:
```
syncFull method: 1
```

用户会问"为什么不是 'POST'?"。Lesson 没解释 `RequestMethod` 是数字 enum:

```ts
enum RequestMethod {
  GET = 0, POST = 1, PUT = 2, DELETE = 3, PATCH = 4, ...
}
```

**修法**:lesson 5.3 验证输出注释里**显式说明** `method: 1` 是 enum 值,不是字符串。

### 盲点 4(轻):`path` 不带前导 `/`

用户看到的 `path: 'api/sync/full/:businessLine'` 看起来怪(没前导 /)。Lesson 没解释 NestJS 设计是**不带前导 /**,启动时拼接。

**修法**:同上,5.3 验证输出注释里说明。

## lesson 之后的"问答附录"模式

0009 写完后用户问了 10 个 Q&A(DI / @Injectable / module 组织 / 跨 module / AppModule imports / Controller 不 export / 死代码 / reflect-metadata / @Module 字段 / 跨进程),这些**应该写进 lesson 但当时没写**。

**已沉淀到 LR-0012**(`0012-module-di-primer.md`)— 作为 0010 / 0014 / 0011 的前置知识。

**未来 lesson 设计原则**:**写完 lesson 后,自查 5 个"对术语不熟"问题**:
1. DI 是什么?
2. @Injectable() 缺了会怎样?
3. Service 应该在哪注册?
4. 跨 module 怎么调?
5. exports 是什么?

如果 lesson 现有内容不能直接答,**这些是 lesson 漏的内容**,放进 lesson 的"附录"或单独 LR。

## 跨节共性:principles 轨道的设计挑战

0009 是 principles 轨道第一课。**前 8 节都是"用框架",从 0009 开始是"理解框架"**。两类 lesson 的设计哲学不同:

| 维度 | 8 节(用框架) | 0009+(理解框架) |
|---|---|---|
| 主线 | 跑通一个 feature | 拆开一个机制 |
| 产出 | production 代码 | theory + 验证 demo |
| 验证 | curl / commit | 跑 demo + 答 quiz |
| 失败容忍 | 重做一次 | 重新拆 |

**理解框架的 lesson 容易"听起来对,跑起来错"**。5.3 验证步骤就是典型 — theory 上完美,production 路径上跑不通。

**未来 lesson 设计原则**(principles 轨道):
- 每个验证步骤都标注"绕开 production 路径"或"走 production 路径"
- "绕开"用 script 验证 metadata / type / schema
- "走" 用真实 HTTP 请求

## Implications for next sessions

| 课 | 引用本 LR 的章节 |
|---|---|
| 0010 IoC | 盲点 3 (RequestMethod enum), 盲点 4 (path 拼接) |
| 0011 AOP | 5.3 改 script 模式 — AOP 验证也是同样套路(不在生产路径上跑) |
| 0014 Module | 5.3 lesson 模式 = "lesson 设计自查"清单 |

## 给未来的 lesson 设计的 5 个 mental check

每节 lesson 写完后,问这 5 个问题:

1. **示例代码能直接跑吗?**(所有标识符真实可解析)
2. **验证步骤绕开 production 路径吗?**(用 script / unit test / 直接读 metadata)
3. **数字 enum / magic number 都解释了吗?**(不只是 "1",是 "RequestMethod.POST = 1")
4. **任何"假设文件已有 X"都标了吗?**(lesson 改 constructor 会丢 PinoLogger 这种,见 0008 blindspot)
5. **用户能跑出 5-10 行有用的输出吗?**(demo 文件要立刻跑,不是"读到这里就懂")

## 关键 stat(0009 实际跑通)

| 维度 | 数量 |
|---|---|
| Quiz 满分 | 3/3 |
| 真实工程坑发现 | 4(都在本 LR) |
| 真实工程坑已修 | 4(lesson 5.3 改了,示例代码改了,enum 解释了,path 解释了) |
| 关联 LR | LR-0012(Module/DI primer)— 10 个问答附录 |

## 给后续 0010 / 0011 / 0014 准备的"前置阅读"

任何开始 0010 的人,**先读 LR-0012**(Module/DI primer)再开始 — 那里有 10 个问答,涵盖了 principles 轨道的"心智模型"。

LR-0012 + LR-0013 一起 = 0010 / 0011 / 0014 的完整前置知识。