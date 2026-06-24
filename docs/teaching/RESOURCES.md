# NestJS 企业级开发 Resources

> 优先级原则: 官方文档 > 一手原理文章 > 高声誉社区 > 营销教程。带 `★` 的是这一阶段必读。

## Knowledge

### Node.js 运行时基础(给前端工程师)

- ★ [Node.js Docs — The Node.js Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick)
  Node 官方对事件循环最权威的描述。讲清 phases( timers → pending → idle → poll → check → close )和 `process.nextTick` / `Promise.then` 的执行序。
- ★ [Node.js Docs — Modules: CommonJS modules](https://nodejs.org/api/modules.html)
  CJS 模块解析规则,为何 `require()` 是同步的,以及循环依赖怎么发生。
- [Node.js Docs — Process](https://nodejs.org/api/process.html)
  `process.env` / `process.cwd()` / 信号(`SIGTERM`/`SIGINT`)/ `uncaughtException` / `unhandledRejection` 全在这里。
- [MDN — Event loop in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop)
  浏览器侧事件循环参考,跟 Node 侧做对比,适合前端出身的工程师切入。
- [libuv 官方文档](http://docs.libuv.org/)
  Node 跨平台异步 I/O 底层,理解 worker threads / thread pool 来自这里。
- [Node.js Best Practices(github.com/goldbergyoni)](https://github.com/goldbergyoni/nodebestpractices) ★
  100+ 条社区共识的 Node 最佳实践,几乎每个 backend 工程师的"床头书"。中文版质量也高。

### NestJS 框架

- ★ [NestJS 官方文档(英文)](https://docs.nestjs.com/) — 唯一权威来源
  按 first steps → overview → fundamentals → techniques 顺序读,不要跳级。
- [NestJS 中文文档(社区翻译)](https://docs.nestjs.cn/)
  翻译可能滞后,复杂场景以英文为准;但入门期效率高。
- [NestJS 源码](https://github.com/nestjs/nest) — 装饰器怎么实现的 / DI 容器怎么 resolve 的
- [Awesome NestJS](https://github.com/nestjs/awesome-nestjs) — 官方收录的生态模块清单

### 关键子主题(可观测性第一阶段要用)

- ★ [Pino — 极快的 Node JSON logger](https://github.com/pinojs/pino)
  企业级日志的事实标准。`pino-http` 自动加 request id,`pino-pretty` 在开发期美化。
- [nestjs-pino](https://github.com/iamolegga/nestjs-pino) — NestJS 集成 Pino 的标准方式
- [@nestjs/terminus](https://docs.nestjs.com/recipes/terminus) — 健康检查标准库
- [@nestjs/swagger](https://docs.nestjs.com/openapi/introduction) — OpenAPI 自动生成
- [@nestjs/throttler](https://docs.nestjs.com/security/rate-limiting) — 限流
- [AsyncLocalStorage(MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncLocalStorage)
  日志上下文传递的"标准 Node 答案",Pino 的 `mixin` 钩子依赖它。

### 进阶(等第一阶段完成后会回填)

- [Node.js Design Patterns(Mario Casciaro, 4th ed., 2024)](https://www.nodejsdesignpatterns.com/)
  企业架构的圣经级书,涵盖 DI 容器、消息总线、Stream、CRDT、gRPC 模式。
- [Effective TypeScript(Dan Vanderkam)](https://effectivetypescript.dev/)
  TypeScript 在大型项目里的"少踩坑"指南。
- [Database per Service( microservices.io )](https://microservices.io/patterns/data/database-per-service.html)
  解释本项目为啥要拆 service 而不是单库。

## Wisdom (Communities)

- ★ [r/node — Reddit](https://reddit.com/r/node)
  经验混合度大,但问"我这样做对吗"会得到老手回答。
- ★ [NestJS Discord](https://discord.gg/nestjs)
  框架作者活跃,问 NestJS 内部机制能拿到一手答案。
- [r/NestJS](https://reddit.com/r/nestjs)
  节奏比 Discord 慢,适合看完整问题+长答。
- [Hacker News(Ask HN: NestJS in production)](https://hn.algolia.com/?q=nestjs+production)
  看别人在 production 踩的坑,比教程值钱 10 倍。
- [掘金 NestJS 标签](https://juejin.cn/tag/NestJS) — 中文实战文章密度高
- [思否 NestJS 标签](https://stackoverflow.com/questions/tagged/nestjs) — 错题集

> 你目前没表达过"不想参与社区"的偏好,我会先按这个清单推荐;若你更想要"只读不发言"的姿势,告诉我,我把重心挪到一手文章。

### 企业级数据库架构(Phase E 0051-0056 配套)

> **配套参考**:`docs/teaching/reference/enterprise-database-architecture.md`(必读)。
> **主题**:外键禁用 + 高并发 + 分库分表 + 分布式事务 + 微服务 DB per Service。

- ★ [《数据密集型应用系统设计》(DDIA, Martin Kleppmann)](https://dataintensive.net/)
  第 5 章复制 / 第 6 章分区 / 第 7 章事务 / 第 9 章一致性与共识。**Phase E 整套前置阅读**。
- ★ [microservices.io — Database per Service](https://microservices.io/patterns/data/database-per-service.html)
  Chris Richardson 维护,微服务模式权威目录。
- ★ [microservices.io — Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
  Outbox 模式的标准定义。
- ★ [microservices.io — Saga](https://microservices.io/patterns/data/saga.html)
  Saga 模式 + 编排式 vs 编舞式。
- [《阿里 Java 开发手册》MySQL 规约](https://developer.aliyun.com/topic/java-development-manual)
  "不得使用外键与级联" — 国内大厂生产铁律。
- [MySQL 官方手册 — InnoDB Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.0/en/innodb-foreign-key-constraints.html)
  MySQL 官方对外键的实现细节 + 性能影响。
- [Apache ShardingSphere 文档](https://shardingsphere.apache.org/document/current/en/overview/)
  Java 生态 sharding 中间件标准(参考,Phase E 不强求 nest-search 用)。
- [Vitess 官方文档](https://vitess.io/docs/)
  YouTube 用 10+ 年的 MySQL sharding proxy。
- [Percona Database Performance Blog](https://www.percona.com/blog/)
  MySQL 高并发调优实战文章最密集的来源。
- [Twitter Snowflake(archive)](https://github.com/twitter-archive/snowflake)
  Snowflake ID 算法原始论文 + Scala 实现。
- [美团 Leaf](https://github.com/Meituan-Dianping/Leaf)
  Snowflake 改进版,DB 分配 workerId,Phase E 0054 可参考。
- [TiDB 文档](https://docs.pingcap.com/tidb/stable)
  NewSQL 分布式 MySQL 替代,Phase E 0054 选型参考。

### 中文实战文章

- [InfoQ — 微服务架构下的数据库分库分表实践](https://www.infoq.cn/)
  搜 "分库分表" / "外键" / "微服务数据库"
- [掘金 — Drizzle ORM 实战](https://juejin.cn/tag/drizzle-orm) — 中等密度
- [美团技术团队 — 分布式 ID 方案](https://tech.meituan.com/) — 美团 Leaf 中文详细解析

## Gaps (待补的资源)

- 中文 NestJS enterprise 落地案例(大厂团队怎么用)目前没找到公认权威的,可能需要去字节/阿里技术博客翻。
- Pino + Drizzle/MySQL 链路追踪案例少,第一课落地时若不够顺会先做 demo,再做整合。
- Node.js 生态的分库分表中间件 — 没有 ShardingSphere-JDBC 这种事实标准,Phase E 0054 选型需要从 Vitess(proxy,Go) / 应用层手写 / 直接换 TiDB 中选
- Phase E 0055 Outbox 模式的 Node 实战代码相对少(Java/Go 例子多),nest-search 改造时撞到的具体 TS 错要先 demo 再固化
