# NestJS 学习指南

基于 `nest-search` 项目的 NestJS 系统性学习文档，面向前端开发者。

## 项目技术栈概览

```
nest-search (monorepo)
├── apps/
│   ├── auth-service      # 认证服务 (NestJS + MySQL + Redis)
│   ├── search-service    # 搜索服务 (NestJS + Elasticsearch)
│   ├── form-service      # 表单服务 (NestJS)
│   ├── sync-service      # 同步服务 (NestJS + RabbitMQ)
│   ├── gateway           # API 网关 (NestJS)
│   ├── ds-frontend       # 前端 (TanStack Start/React)
│   ├── auth-frontend     # 前端
│   ├── zk-frontend       # 前端
│   └── meeting-frontend  # 前端
├── libs/
│   └── frontend-shared   # 前端共享代码
```

## 核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| @nestjs/core | ^11.1.19 | 核心框架 |
| @nestjs/common | ^11.1.19 | 常用模块 |
| @nestjs/config | ^4.0.4 | 配置管理 |
| @nestjs/platform-express | ^11.1.19 | HTTP 平台 |
| @nestjs/microservices | ^11.1.19 | 微服务支持 |
| @nestjs/schedule | ^6.1.3 | 定时任务 |
| reflect-metadata | ^0.2.2 | 装饰器元数据 |
| rxjs | ^7.8.2 | 响应式编程 |

## 核心概念与项目实现

### 1. 模块 (Module)

模块是组织代码的基本单位，每个 NestJS 应用至少有一个根模块。

```typescript
// apps/auth-service/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { CasModule } from '../cas/cas.module';

@Module({
  imports: [UserModule, CasModule],  // 导入依赖的模块
  controllers: [AuthController],      // 注册控制器
  providers: [AuthService],          // 注册服务
  exports: [AuthService],             // 导出供其他模块使用
})
export class AuthModule {}
```

**要点:**
- `@Module()` 装饰器标记一个类为模块
- `imports`: 依赖的其他模块
- `controllers`: 处理 HTTP 请求
- `providers`: 服务和依赖注入
- `exports`: 允许其他模块访问

### 2. 控制器 (Controller)

控制器处理 HTTP 请求和响应。

```typescript
// apps/auth-service/src/auth/auth.controller.ts
import { Controller, Post, Body, HttpCode } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }
}
```

**要点:**
- `@Controller()` 定义路由前缀
- `@Get()`, `@Post()`, `@Put()`, `@Delete()` 定义 HTTP 方法
- `@Body()`, `@Param()`, `@Query()` 获取请求数据
- 通过构造函数注入服务

### 3. 服务 (Service)

服务封装业务逻辑，使用依赖注入。

```typescript
// apps/auth-service/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly userModule: UserModule,
    private readonly casModule: CasModule,
  ) {}

  async login(email: string, password: string) {
    // 业务逻辑
  }
}
```

**要点:**
- `@Injectable()` 标记为可注入的服务
- 构造函数注入依赖
- 服务可以注入其他服务或模块

### 4. 依赖注入 (Dependency Injection)

NestJS 内置IoC容器自动解析依赖关系。

```typescript
// 构造函数注入 (推荐)
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
}

// 或使用 inject 方法
export class AuthService {
  constructor(
    @Inject(USER_SERVICE) private readonly userService: UserService,
  ) {}
}
```

### 5. 守卫 (Guard)

守卫用于权限控制和认证。

```typescript
// apps/gateway/src/guards/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];
    return apiKey === process.env.API_KEY;
  }
}
```

**守卫使用:**

```typescript
// apps/gateway/src/app.module.ts
@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
```

### 6. 过滤器 (Filter)

过滤器处理异常和错误。

```typescript
// apps/gateway/src/filters/all-exceptions.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 7. 配置模块 (ConfigModule)

使用 `@nestjs/config` 管理环境变量。

```typescript
// apps/auth-service/src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  // 全局配置
  ],
})
export class AppModule {}

// 使用配置
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(private config: ConfigService) {}

  getJwtSecret() {
    return this.config.get('JWT_SECRET');
  }
}
```

### 8. 数据库 (Drizzle ORM)

项目使用 Drizzle ORM 连接 MySQL。

```typescript
// apps/auth-service/src/database/drizzle.module.ts
import { Module, Global } from '@nestjs/common';
import { DrizzleService } from './drizzle.service';

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}
```

### 9. Redis (ioredis)

Redis 用于缓存和会话管理。

```typescript
// apps/auth-service/src/redis/redis.module.ts
import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

### 10. 微服务 (Microservices)

使用 RabbitMQ 进行服务间通信。

```typescript
// 发送消息
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class SyncService {
  constructor(
    @Inject('SYNC_SERVICE') private readonly client: ClientProxy,
  ) {}

  sendMessage(pattern: string, data: any) {
    this.client.send(pattern, data).subscribe();
  }
}
```

### 11. 生命周期钩子 (Lifecycle Hooks)

```typescript
// apps/search-service/src/app.module.ts
@Module({
  imports: [SearchModule],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly esService: ElasticsearchService) {}

  async onModuleInit() {
    // 应用启动时初始化
    await initIndices(this.esService);
  }
}
```

常用钩子:
- `onModuleInit()` - 模块初始化时
- `onModuleDestroy()` - 模块销毁时
- `onApplicationBootstrap()` - 应用启动完成时
- `onApplicationShutdown()` - 应用关闭时

### 12. 全局模块 (Global Modules)

将服务设为全局可访问，避免重复导入。

```typescript
@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}
```

## 进阶主题

### 管道 (Pipe)

用于数据验证和转换。

```typescript
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any) {
    if (!value) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }
}
```

### 拦截器 (Interceptor)

用于日志、缓存、响应转换。

```typescript
import { Injectable, NestInterceptor, ExecutionContext } from '@nestjs/common';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: any) {
    console.log('Before...');
    return next.handle().pipe(tap(() => console.log('After...')));
  }
}
```

### 中间件 (Middleware)

Express 中间件级别的请求处理。

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    console.log('Request...');
    next();
  }
}
```

## 学习资源

### 官方文档

- [NestJS 官方文档](https://docs.nestjs.com/) - 最权威的学习资料
- [NestJS 源码](https://github.com/nestjs/nest) - 深入理解内部实现

### 核心概念

| 主题 | 资源 |
|------|------|
| 模块系统 | [Modules](https://docs.nestjs.com/modules/basics) |
| 控制器 | [Controllers](https://docs.nestjs.com/controllers/basics) |
| 提供者 | [Providers](https://docs.nestjs.com/providers/basics) |
| 依赖注入 | [Dependency Injection](https://docs.nestjs.com/fundamentals/dependency-injection) |
| 中间件 | [Middleware](https://docs.nestjs.com/middleware) |
| 守卫 | [Guards](https://docs.nestjs.com/guards) |
| 拦截器 | [Interceptors](https://docs.nestjs.com/interceptors) |
| 过滤器 | [Exception Filters](https://docs.nestjs.com/exception-filters) |
| 管道 | [Pipes](https://docs.nestjs.com/pipes) |

### 特定功能

| 功能 | 资源 |
|------|------|
| ConfigModule | [Configuration](https://docs.nestjs.com/techniques/configuration) |
| 数据库 | [Database](https://docs.nestjs.com/techniques/database) |
| 验证 | [Validation](https://docs.nestjs.com/techniques/validation) |
| 序列化 | [Serialization](https://docs.nestjs.com/techniques/serialization) |
| 定时任务 | [Schedule](https://docs.nestjs.com/techniques/task-scheduling) |
| 微服务 | [Microservices](https://docs.nestjs.com/microservices/basics) |

### 在线课程

- [NestJS Zero to Hero](https://www.udemy.com/course/nestjs-zero-to-hero/) - Udemy 付费课程
- [NestJS: The Complete Developer's Guide](https://www.udemy.com/course/nestjs-the-complete-developers-guide/) - 高级课程

### 视频教程

- [NestJS 官方 YouTube](https://www.youtube.com/@NestJSFramework)
- [FreeCodeCamp NestJS Course](https://www.youtube.com/watch?v=GH5dt6NyR1E) - YouTube 免费教程

### 项目参考

本项目 `nest-search` 展示了:
- 微服务架构模式
- 模块化设计
- 数据库集成 (Drizzle + MySQL)
- 缓存 (Redis)
- 搜索 (Elasticsearch)
- API 网关模式
- 认证与授权 (JWT + 守卫)

## 学习路径建议

### 第一阶段：基础 (1-2周)

1. 阅读 [官方文档 - First Steps](https://docs.nestjs.com/first-steps)
2. 理解 [Controllers](https://docs.nestjs.com/controllers/basics) 和 [Providers](https://docs.nestjs.com/providers/basics)
3. 实践：创建一个简单的 CRUD 模块

### 第二阶段：核心概念 (2-3周)

1. 深入学习 [Modules](https://docs.nestjs.com/modules/basics)
2. 理解 [Dependency Injection](https://docs.nestjs.com/fundamentals/dependency-injection)
3. 掌握 [Guards](https://docs.nestjs.com/guards) 和 [Exception Filters](https://docs.nestjs.com/exception-filters)
4. 实践：参考 `auth-service` 实现一个完整的认证模块

### 第三阶段：进阶 (3-4周)

1. 学习 [Configuration](https://docs.nestjs.com/techniques/configuration)
2. 掌握 [Database](https://docs.nestjs.com/techniques/database) 集成
3. 理解 [Validation](https://docs.nestjs.com/techniques/validation)
4. 实践：参考 `search-service` 集成 Elasticsearch

### 第四阶段：生产级 (4-6周)

1. 学习 [Microservices](https://docs.nestjs.com/microservices/basics)
2. 理解 [Testing](https://docs.nestjs.com/fundamentals/testing)
3. 掌握部署和监控
4. 实践：参考 `gateway` 实现 API 网关

## 与前端对比

| NestJS | 前端类比 |
|--------|----------|
| Module | React Component / Redux slice |
| Controller | API Route Handler |
| Service | Business Logic Hook |
| Guard | Auth Middleware |
| Pipe | Request/Response Transformer |
| Filter | Error Boundary |
| Interceptor | HOC (Higher-Order Component) |

## 下一步

1. 阅读 `apps/auth-service/src/` 理解认证流程
2. 查看 `apps/gateway/src/` 理解网关模式
3. 参考 `apps/search-service/src/` 学习 Elasticsearch 集成
4. 查看 `drizzle.config.ts` 理解数据库配置

---

生成时间: 2026-05-15
项目: nest-search