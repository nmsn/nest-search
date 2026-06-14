# 0004 — 事件循环 `poll` 阶段的误解

Quiz Q1(事件循环哪个阶段"什么都不做地等下一个事件")用户选了 `timers` 而非 `poll`。

**为什么是误解**: 用户把"等待"和"管理时间"画了等号。直觉上 `setTimeout` 跟"时间"绑定,所以 `timers` 像"等待区"是合理的第一反应。但 timers 阶段从不阻塞 — 它每次只是把到期的回调取出来执行,然后立刻走人;真正"算我能睡多久"的是 `poll`。

**正确直觉**: poll 阶段是 Node 主线程的"停车场",里面没车又没人催,就熄火睡觉;有车(新 I/O 事件)来,立刻醒过来处理。

**Implications for next sessions**:
- 后面讲 NestJS 请求生命周期时,会再用到这个图 — 解释"一个 HTTP 请求进来后,Node 在哪一阶段拿到它"(答:网络 I/O 完成 → pending callbacks → poll → poll 把请求对象转给 NestJS handler)
- 类似表述要避免"Node 阻塞在 timers 等待 setTimeout"这种说法,会引起二次误解
- 用户对 `process.cwd()` / `__dirname` / `process.env` 这类"路径 + 环境变量"的概念已经清楚,后续不需要重复解释
- 用户的 Q2 (env 注入) + Q3 (cwd vs __dirname) 都答对了,显示"后端配置层"直觉已经在线
