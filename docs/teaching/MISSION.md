# Mission: NestJS 企业级开发 (边学边完善 nest-search)

## Why
从 8 年高级前端进阶为 T 形工程师 — 能够在 `nest-search` 这个 monorepo 里独立设计、实现、上线一个后端服务,把过去只能"调 API"的工作变成能"提供 API",并对可观测性、安全、可维护性有体系化的判断力。

## Success looks like
- 能在一个新场景下,从零设计 module / 边界 / 契约,而不是照抄模板
- 看 `apps/gateway` / `apps/auth-service` 任意一处的代码,能讲出"为什么这样写、有什么替代方案、production 缺什么"
- 在 `nest-search` 中交付 3-5 个具体的"企业级补丁"(结构化日志、Swagger、healthcheck、限流、测试、配置校验等),每个都能跑、能复现价值
- 能用 NestJS 的术语(Module/Provider/Scope/Interceptor/Pipe/Guard/Filter/Cycle)清楚描述问题
- 能在 PR 评审里挑出后端同事会留下的隐患(事务边界、N+1、错误信息泄露、token 续签等)

## Constraints
- 工作目录: `/Users/nmsn/Studio/nest-search`(已是 NestJS 11 monorepo,基础设施齐全)
- 工具栈已固定: TypeScript 6 / pnpm / Drizzle / MySQL / ioredis / amqplib / @elastic/elasticsearch / Jest(已装但未用)
- 学习方式: 边做边学 — 每一课要么产出一个 lesson,要么产出一次实际代码改动
- 假设你已经会的: TypeScript、ES 语法、HTTP/REST、Promise/async-await、React 生态;Node.js 本身需要"补底"
- 节奏: 1 课 ≈ 1 个可独立交付的小事,不要试图一次学完整个 NestJS

## Out of scope
- Kubernetes / 容器编排 / 部署流水线(本项目暂时不涉及)
- Go / Rust / 其它后端语言横向对比
- 深度算法 / 数据结构
- 前端 React/Vite 优化(那是你熟悉的)
- DDD / 事件溯源 / CQRS 等重型架构(本项目规模不需要,提到即可)
