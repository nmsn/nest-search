# 0025 · AllExceptionsFilter + 业务异常分类(NestJS)

> Phase A 第 7 课。0024 做完 Drizzle 索引 + N+1 检测,0025 回到**错误处理**：把 gateway 的 AllExceptionsFilter 推广到所有 service，并建立业务异常分类体系。
>
> **2026-06-24**:所有 service 都用 Pino 日志(nestjs-pino),filter 统一注入 PinoLogger。

## 你今天会拿到什么

1. 理解 **为什么每个 service 都需要 AllExceptionsFilter**（不是只有 gateway）
2. 亲手把 filter 从 gateway 复制到 auth-service / form-service / search-service / sync-service
3. 建立 **业务异常基类 `BusinessException`**，让错误码 + 消息统一管理
4. 理解 **5xx vs 4xx 日志策略**（error vs debug）
5. 21 测试还过 + 1 个 commit

---

## §1. nest-search 当前错误处理现状

```
AllExceptionsFilter:
✅ apps/gateway/src/filters/all-exceptions.filter.ts
❌ apps/auth-service   — 无 filter,未捕获异常 → Express 默认 500 + stack trace 泄漏
❌ apps/form-service   — 同上
❌ apps/search-service — 同上
❌ apps/sync-service   — 同上
```

**后果**：

```bash
# 假设 auth-service 的 userService.findByName 抛了未预期的 Error
curl http://localhost:3001/api/auth/me

# 没有 filter 时,返回:
{
  "statusCode": 500,
  "message": "Internal Server Error",
  stack: "Error: something broke\n    at ..."   # ← stack trace 泄漏到客户端!
}

# 有 filter 时,返回:
{
  "statusCode": 500,
  "message": "Internal server error",
  "timestamp": "2026-06-24T12:00:00.000Z",
  "path": "/api/auth/me"
  # ← 干净,stack 只在 server 日志里
}
```

**关键差异**：
- 没有 filter → Express 默认 handler → **stack trace 泄漏**（安全风险）
- 有 filter → 统一响应格式 + **stack 只记在 server log**

---

## §2. 设计决策（动手前先想）

### 决策 1 · filter 放哪里？

```ts
// 方案 A:每个 service 自己复制一份 filter
apps/auth-service/src/filters/all-exceptions.filter.ts
apps/form-service/src/filters/all-exceptions.filter.ts
// ...

// 方案 B:放 libs/shared/,所有 service import
libs/shared/src/filters/all-exceptions.filter.ts
```

**选 A**。理由：
- filter 内部用 `@InjectPinoLogger()` 依赖注入，跟 LoggerModule 绑定
- 各 service 的 LoggerModule 配置不同（log level、genReqId 策略）
- 复制成本低（60 行），但解耦了各 service 的日志配置
- 企业级做法是每个 service 有自己的 filter（方便后续加 Sentry / 不同日志格式）

### 决策 2 · 业务异常要不要自定义基类？

```ts
// 现状:直接抛 NestJS 内置异常
throw new NotFoundException('user not found');
throw new ConflictException('username already exists');
throw new UnauthorizedException('invalid credentials');

// 问题:
// 1. 错误码散落在各处,没有统一管理
// 2. 无法按业务错误码做细粒度处理(比如 Sentry fingerprint)
// 3. 前端只能靠 message 字符串匹配,不稳定
```

**选：建 `BusinessException` 基类**。理由：
- 统一 `errorCode` 字段（如 `USER_NOT_FOUND`、`CAS_TICKET_EXPIRED`）
- 继承 `HttpException`，filter 不用改
- 前端按 `errorCode` 做逻辑，不靠 message

### 决策 3 · 文件结构

```
apps/auth-service/src/
├── filters/
│   └── all-exceptions.filter.ts   ← 新建
├── exceptions/                     ← 新建目录
│   ├── business.exception.ts      ← 基类
│   ├── user.exceptions.ts         ← 用户相关
│   └── cas.exceptions.ts          ← CAS 相关
└── app.module.ts                   ← 注册 filter
```

---

## §3. 动手：AllExceptionsFilter（auth-service）

### Step 1 · 创建 filter

```ts
// apps/auth-service/src/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // ✅ 关键: 只 log 5xx,4xx 静默
    if (status >= 500) {
      this.logger.error(
        { err: exception, path: request.url, method: request.method },
        "unhandled exception",
      );
    } else {
      this.logger.debug(
        { status, path: request.url },
        "client error (expected)",
      );
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    response.status(status).json({
      statusCode: status,
      message:
        typeof message === "string"
          ? message
          : (message as any).message || message,
      error:
        typeof message === "string"
          ? message
          : (message as any).error || "Error",
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Step 2 · 在 app.module.ts 注册

```ts
// apps/auth-service/src/app.module.ts
import { APP_FILTER } from "@nestjs/core";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";

@Module({
  imports: [ /* ... 现有 imports 不变 */ ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

**同样的操作复制到 form-service / search-service / sync-service。**

---

## §4. 业务异常基类

### BusinessException 基类

```ts
// apps/auth-service/src/exceptions/business.exception.ts
import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * 业务异常基类。
 * - errorCode:前端按这个字段做逻辑(不靠 message)
 * - httpStatus:默认 400,子类可覆盖
 */
export class BusinessException extends HttpException {
  public readonly errorCode: string;

  constructor(
    errorCode: string,
    message: string,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        statusCode: httpStatus,
        message,
        errorCode,
        error: HttpStatus[httpStatus],
      },
      httpStatus,
    );
    this.errorCode = errorCode;
  }
}
```

### 用户相关异常

```ts
// apps/auth-service/src/exceptions/user.exceptions.ts
import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";

export class UserNotFoundException extends BusinessException {
  constructor(identifier: string | number) {
    super(
      "USER_NOT_FOUND",
      `User not found: ${identifier}`,
      HttpStatus.NOT_FOUND,  // 404
    );
  }
}

export class UsernameConflictException extends BusinessException {
  constructor(username: string) {
    super(
      "USERNAME_CONFLICT",
      `Username already exists: ${username}`,
      HttpStatus.CONFLICT,  // 409
    );
  }
}

export class UserDisabledException extends BusinessException {
  constructor(userId: number) {
    super(
      "USER_DISABLED",
      `User account is disabled: ${userId}`,
      HttpStatus.FORBIDDEN,  // 403
    );
  }
}
```

### CAS 相关异常

```ts
// apps/auth-service/src/exceptions/cas.exceptions.ts
import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";

export class CasServiceNotRegisteredException extends BusinessException {
  constructor(serviceUrl: string) {
    super(
      "CAS_SERVICE_NOT_REGISTERED",
      `CAS service not registered: ${serviceUrl}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CasTicketExpiredException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TICKET_EXPIRED",
      `CAS ticket expired: ${ticket}`,
      HttpStatus.UNAUTHORIZED,  // 401
    );
  }
}

export class CasTicketInvalidException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TICKET_INVALID",
      `CAS ticket invalid: ${ticket}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CasTgtInvalidException extends BusinessException {
  constructor(ticket: string) {
    super(
      "CAS_TGT_INVALID",
      `Invalid or expired TGT: ${ticket}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CasTicketMismatchException extends BusinessException {
  constructor(ticket: string, serviceUrl: string) {
    super(
      "CAS_TICKET_MISMATCH",
      `Service URL mismatch for ticket ${ticket}, expected: ${serviceUrl}`,
      HttpStatus.UNAUTHORIZED,
    );
  }
}
```

---

## §5. 改造现有代码（示范）

### user.service.ts

```ts
// 之前 (user.service.ts 第 23 行)
throw new ConflictException('Username already exists');

// 之后
throw new UsernameConflictException(dto.username);
```

```ts
// 之前 (user.service.ts 第 32 行)
throw new NotFoundException(`User #${id} not found`);

// 之后
throw new UserNotFoundException(id);
```

### cas.service.ts

```ts
// 之前 (cas.service.ts 第 39 行)
throw new UnauthorizedException("Invalid or expired TGT");

// 之后
throw new CasTgtInvalidException(tgtTicket);
```

```ts
// 之前 (cas.service.ts 第 53 行)
throw new BadRequestException("Service not registered");

// 之后
throw new CasServiceNotRegisteredException(serviceUrl);
```

```ts
// 之前 (cas.service.ts 第 84-85 行)
throw new UnauthorizedException("Invalid or expired service ticket");

// 之后
throw new CasTicketInvalidException(ticket);
```

```ts
// 之前 (cas.service.ts 第 87 行)
throw new UnauthorizedException("Service URL mismatch");

// 之后
throw new CasTicketMismatchException(ticket, serviceUrl);
```

```ts
// 之前 (cas.service.ts 第 102 行)
throw new UnauthorizedException("User not found");

// 之后
throw new UserNotFoundException(st.userId);
```

```ts
// 之前 (cas.service.ts 第 103-104 行)
throw new UnauthorizedException("User account is disabled");

// 之后
throw new UserDisabledException(st.userId);
```

**好处**：
- 错误码集中管理（`USER_NOT_FOUND`），不靠字符串匹配
- 前端可以按 `errorCode` 做 i18n 或跳转逻辑
- filter 的 `getResponse()` 会拿到 `{ statusCode, message, errorCode, error }`

---

## §6. filter 里的 errorCode 透传

当前 filter 的响应格式：

```json
{
  "statusCode": 404,
  "message": "User not found: 123",
  "error": "Not Found",
  "timestamp": "2026-06-24T12:00:00.000Z",
  "path": "/api/auth/me"
}
```

如果抛的是 `BusinessException`，`getResponse()` 返回的是：

```json
{
  "statusCode": 404,
  "message": "User not found: 123",
  "errorCode": "USER_NOT_FOUND",     // ← 新字段
  "error": "NOT_FOUND"
}
```

filter 的 `.json()` 会把 `getResponse()` 的内容合并进去，**不需要改 filter 代码**。

---

## §7. 5xx vs 4xx 日志策略详解

```ts
// filter 里的核心逻辑
if (status >= 500) {
  this.logger.error({ err: exception, ... }, "unhandled exception");
} else {
  this.logger.debug({ status, ... }, "client error (expected)");
}
```

**为什么这样分？**

| 级别 | 场景 | 含义 |
|------|------|------|
| `error` | 500 / 502 / 503 | **服务端 bug**，需要告警 + 排查 |
| `debug` | 400 / 401 / 404 / 409 | **客户端问题**，正常业务流程 |

**反模式**（不要这样做）：

```ts
// ❌ 401 也记 error → 日志爆炸，真实 bug 被淹没
this.logger.error({ status: 401, path }, "auth failed");

// ❌ 500 记 debug → 生产事故无声无息
this.logger.debug({ status: 500, err: exception }, "something broke");
```

---

## §8. Quiz

**Q1: 为什么每个 service 都需要自己的 AllExceptionsFilter，而不是只在 gateway 有？**

A) 因为 gateway 的 filter 不能捕获下游 service 的异常
B) 因为 gateway 只代理 HTTP 请求，service 内部的非 HTTP 异常（如 RabbitMQ consumer）不会经过 gateway
C) 因为 NestJS 不支持跨 module 的 filter

**Q2: BusinessException 继承 HttpException 的好处是什么？**

A) 可以让 filter 自动识别为 HTTP 异常，不用改 filter 代码
B) 可以用 HTTP 状态码
C) 两者都是

**Q3: 为什么 4xx 错误用 `debug` 级别而不是 `error`？**

A) 因为 debug 比 error 快
B) 因为 4xx 是客户端问题，不是服务端 bug，不应该告警
C) 因为 Pino 不支持 error 级别

---

## §9. Commit Message

```
feat(auth-service): AllExceptionsFilter + BusinessException 体系

- 新增 filters/all-exceptions.filter.ts (从 gateway 复制)
- 新增 exceptions/ 目录: business.exception.ts + user/cas 异常
- app.module.ts 注册 APP_FILTER
- user.service.ts / cas.service.ts 改用业务异常
- 21 测试还过
```

---

## §10. 跨节链接

- [0005 · Pino 结构化日志](./0005-pino-structured-logging.md) — filter 里的 `this.logger.error` 依赖 Pino
- [0026 · enableShutdownHooks](./0026-graceful-shutdown.md) — 下一课：优雅退出 + 连接清理
- [Drizzle ORM 参考](./reference/drizzle-orm-reference.md) — filter 不涉及 DB，但业务异常可能在 service 层抛出
