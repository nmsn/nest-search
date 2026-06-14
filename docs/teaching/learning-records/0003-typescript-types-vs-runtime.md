# 0003 — 跑通 gateway 时撞到的两个真实工程问题

## 问题 A:`@types/*` 不跟随 `dependencies` 自动装

报错: `Cannot find module 'express' or its corresponding type declarations`。
原因: `@nestjs/platform-express` 把 `express` 拉进来作为运行时依赖,但 **DefinitelyTyped (`@types/express`)** 是独立的元数据仓库,pnpm/npm 不会自动装。修复: `pnpm add -wD @types/express`。

**Implications for next sessions**:
- 凡是 `import { ... } from 'X'` 用到类型时,要先确认 `X` 是不是"自包含类型"(`axios` / `ioredis` / `mysql2` / `drizzle-orm` 都是),还是"需要配套 `@types/X`"(`express` / `bcrypt` / `cookie-parser` / `jsonwebtoken` 都是)
- 装了新后端依赖后,`pnpm install` 完第一件事就是扫一下"有没有新引入的包没有 @types",不然 `tsc` 编译就报这个错
- 这是 pnpm 警告 `ERR_PNPM_ADDING_TO_ROOT` 的常见触发场景 — 根目录 monorepo 必须 `-w` / `--workspace-root` 显式确认

## 问题 B: 全局 `ApiKeyGuard` 误伤了 `/health`

观察: `curl /health` 返回 401,而不是 200 + 服务状态。原因: `apps/gateway/src/app.module.ts` 把 `ApiKeyGuard` 注册为 `APP_GUARD`(全局),NestJS 的 Guard 在所有 handler 之前执行,包括健康检查。

**生产影响**:
- K8s liveness/readiness probe 不可能带 X-API-Key,容器永远会被标 unhealthy
- 任何外部 LB(ALB/nginx)做 health check 时也会被 401 拒掉
- 这就是 LR-0002 里"缺 `@nestjs/terminus`"的具体表现

**修复方向(下节课做)**: 用 `@Public()` 装饰器 + Reflector 把 `/health` 标成"跳过 Guard",或者直接让 `ApiKeyGuard.canActivate` 在 path 以 `/health` 开头时短路放行。前者更标准。

**Implications**:
- 这是"全局中间件"经典 trade-off 的活样本 — 一刀切省事但容易误伤
- 第 6 课(异常过滤器 + 健康检查)会同时解决: ① 写 `@Public()` 装饰器 + ② 用 `@nestjs/terminus` 做真正的健康检查 + ③ AllExceptionsFilter 把 404 也接管
