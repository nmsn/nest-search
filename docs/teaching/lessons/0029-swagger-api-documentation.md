# 0029 · Swagger API 文档 (OpenAPI 3.0)

> Phase A 第 11 课。0028 做完健康检查,0029 补企业必备：**API 文档自动化**。nest-search 5 个 service 都没有 Swagger,前端对接靠口头沟通。

## 你今天会拿到什么

1. 理解 **OpenAPI 规范 vs Swagger 工具**的关系
2. 亲手给 auth-service 装 `@nestjs/swagger` + 自动生成文档
3. 学会用 **装饰器** 描述 DTO / Controller / Response
4. 理解 **Swagger UI** 的用法（前端 / 测试 / 新人上手）
5. 21 测试还过 + 1 个 commit

---

## §1. 为什么需要 API 文档

```
没有 Swagger 时:
  前端: "这个接口参数是什么？"
  后端: "你看代码..." 或 "我发你 Postman collection"
  前端: "返回的字段有哪些？类型是什么？"
  后端: "..."
  → 沟通成本高,文档过时,字段名拼错

有 Swagger 时:
  前端: 打开 http://localhost:3004/api/docs
  → 看到所有接口、参数、返回类型、示例值
  → 可以直接在页面上试调用
  → 文档永远和代码同步（从代码生成）
```

---

## §2. OpenAPI vs Swagger

```
OpenAPI = 规范 (Specification)
  - 定义 API 的标准格式 (JSON/YAML)
  - 由 OpenAPI Initiative 维护
  - 当前版本: 3.1.0

Swagger = 工具集 (Tooling)
  - Swagger UI: 可视化文档页面
  - Swagger Editor: 编辑 spec
  - Swagger Codegen: 从 spec 生成客户端代码

NestJS 的 @nestjs/swagger:
  - 自动生成 OpenAPI 3.0 spec
  - 内置 Swagger UI
  - 一行代码搞定
```

---

## §3. 动手：安装 + 基础配置

### Step 1 · 安装依赖

```bash
pnpm add @nestjs/swagger
```

### Step 2 · main.ts 配置

```ts
// apps/auth-service/src/main.ts
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ... 现有配置 ...

  // Swagger 配置
  const config = new DocumentBuilder()
    .setTitle('Auth Service')
    .setDescription('认证中心 API')
    .setVersion('1.0')
    .addBearerAuth()  // 支持 JWT Bearer Token
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  //                      ↑ URL 路径: http://localhost:3004/api/docs

  await app.listen(port);
}
```

### Step 3 · 访问

```
http://localhost:3004/api/docs        → Swagger UI 页面
http://localhost:3004/api/docs-json   → OpenAPI JSON spec
```

---

## §4. 装饰器描述 DTO

### @ApiProperty — 字段描述

```ts
// apps/auth-service/src/database/dto/users.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: '用户名', example: 'alice' })
  username: string;

  @ApiProperty({ description: '密码', example: 'password123', minLength: 6 })
  password: string;

  @ApiProperty({ description: '邮箱', example: 'alice@example.com', required: false })
  email?: string;

  @ApiProperty({ description: '角色', enum: ['admin', 'user'], default: 'user' })
  role?: string;
}
```

### @ApiResponse — 响应描述

```ts
// apps/auth-service/src/auth/auth.controller.ts
import { ApiResponse } from '@nestjs/swagger';

@Post('login')
@ApiResponse({ status: 201, description: '登录成功', type: LoginResponseDto })
@ApiResponse({ status: 401, description: '用户名或密码错误' })
async login(@Body() dto: LoginDto) { ... }
```

### @ApiTags — 分组

```ts
@ApiTags('auth')  // 接口分组: "auth" 标签下
@Controller('api/auth')
export class AuthController { ... }
```

### @ApiBearerAuth — 需要认证

```ts
@Get('me')
@ApiBearerAuth()  // 显示锁头图标,提示需要 Bearer Token
async me() { ... }
```

---

## §5. 设计决策

### 决策 1 · 每个 service 都装还是只装 gateway？

```
方案 A: 只在 gateway 装 Swagger
  优点: 一个入口看所有 API
  缺点: gateway 是代理,看不到下游 service 的真实 DTO

方案 B: 每个 service 装自己的 Swagger
  优点: 每个 service 有独立文档,DTO 和代码同步
  缺点: 5 个 UI 入口
```

**选 B**。理由：
- 每个 service 独立部署,有自己的 DTO
- 开发时看自己负责的 service 的文档
- gateway 可以聚合所有 service 的 spec（后续做）

### 决策 2 · 用 Zod schema 还是手写 DTO 装饰器？

```ts
// 方案 A: 在 Zod schema 上加 @ApiProperty
// 需要额外映射,Zod 和 Swagger 装饰器不兼容

// 方案 B: 手写 DTO class + @ApiProperty
// 和 Zod schema 分开维护

// 方案 C: 用 zod-to-openapi 库自动转换
// 一步到位,但多一个依赖
```

**选 B**。理由：
- nest-search 已经有 Zod schema 做验证
- DTO class 只用于 Swagger 文档描述
- 两者各司其职,不互相耦合

---

## §6. Quiz

**Q1: OpenAPI 和 Swagger 的关系是什么？**

A) 两个不同的东西
B) OpenAPI 是规范,Swagger 是实现 OpenAPI 的工具集
C) Swagger 是 OpenAPI 的升级版

**Q2: Swagger 文档为什么能和代码保持同步？**

A) 因为有人手动更新
B) 因为文档从代码装饰器自动生成,改代码就改文档
C) 因为用了 Git 同步

**Q3: @ApiBearerAuth() 装饰器的作用是什么？**

A) 自动验证 Token
B) 在 Swagger UI 上显示锁头图标,提示该接口需要 Bearer Token
C) 生成 Bearer Token

---

## §7. Commit Message

```
feat(auth-service): 0029 Swagger API 文档

- 安装 @nestjs/swagger
- main.ts 配置 SwaggerModule + DocumentBuilder
- /api/docs 路径挂载 Swagger UI
- 21 测试还过
```

---

## §8. 跨节链接

- [0028 · 健康检查](./0028-health-check-deep-dive.md) — 上一课
- [0030 · CORS + 安全头](./0030-cors-security-headers.md) — 下一课
