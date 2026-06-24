# Validation 库速查 · class-validator vs Zod

> nest-search 2022-2024 用 class-validator(默认),0022 起逐步切 Zod。本文档讲透两者差异 + nest-search 实战模式。

## 导航

- §1 [一句话区别](#1-一句话区别)
- §2 [12 维度对比表](#2-12-维度对比表)
- §3 [API 风格对比(代码)](#3-api-风格对比代码)
- §4 [运行时机制对比](#4-运行时机制对比)
- §5 [类型推断深度对比](#5-类型推断深度对比)
- §6 [嵌套 + 复杂校验](#6-嵌套--复杂校验)
- §7 [错误处理](#7-错误处理)
- §8 [跟 NestJS 集成](#8-跟-nestjs-集成)
- §9 [跟 Drizzle 集成](#9-跟-drizzle-集成)
- §10 [性能基准](#10-性能基准)
- §11 [迁移路径(class-validator → Zod)](#11-迁移路径class-validator--zod)
- §12 [nest-search 实战状态](#12-nest-search-实战状态)

---

## 1. 一句话区别

| | class-validator | Zod |
|---|---|---|
| **API 风格** | TypeScript 装饰器 | 纯 schema 对象 |
| **类型推断** | 需要 class-transformer 二次推断 | **原生 TS 推断** |
| **运行时** | 必须 NestJS(用 ValidationPipe) | **任何 JS 环境**(纯函数) |
| **跟 Drizzle** | ❌ 不联动 | ✅ **drizzle-zod 一键生成** |

**Zod 是"TS 优先"的设计哲学**,schema 是 single source of truth,装饰器和 TS class 是"过去 NestJS 历史包袱"。

---

## 2. 12 维度对比表

| 维度 | class-validator | Zod | 胜者 |
|---|---|---|---|
| **API 风格** | 装饰器 | schema | 平(zod 更纯) |
| **TS 类型推断** | ❌ 要 class-transformer 二次转换 | ✅ `z.infer<typeof Schema>` | **Zod** |
| **运行时依赖** | NestJS ValidationPipe | 纯函数(哪都能跑) | **Zod** |
| **跟 Drizzle 集成** | ❌ 手写 DTO | ✅ `drizzle-zod` 自动生成 | **Zod** |
| **跟 React Hook Form** | ⚠️ 需要 `@nestjs/class-validator` resolver | ✅ `zodResolver`(原生) | **Zod** |
| **Bundle size** | ~25KB(class-validator + transformer) | ~12KB(zod 3.x 树摇友好) | **Zod** |
| **性能(运行时校验)** | 较慢(反射 + reflect-metadata) | 较快(纯函数) | **Zod** |
| **错误信息** | `constraints` 数组 | `flatten().fieldErrors`(结构化) | 平 |
| **可组合性** | `@ValidateNested` 类嵌套 | `.merge() / .extend() / .pick() / .omit()` | **Zod** |
| **学习曲线** | 装饰器已熟 | schema 函数式 | 平(看习惯) |
| **NestJS 文档/社区** | ✅ 默认/官方/成熟 | ⚠️ 需 `nestjs-zod` 桥接 | **class-validator** |
| **运行时 schema 不一致风险** | ⚠️ TS class 改了忘改装饰器 | ✅ schema 是 source of truth | **Zod** |

---

## 3. API 风格对比(代码)

### 3.1 class-validator 写法

```ts
// dto/create-user.dto.ts
import { IsString, MinLength, IsEmail, IsEnum, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['admin', 'user'])
  role?: 'admin' | 'user';
}

// 控制器
@Post()
create(@Body() dto: CreateUserDto) { ... }

// 类型推断:CreateUserDto 直接当 TS 类型用
// 运行时:reflect-metadata 读装饰器,ValidationPipe 调 class-validator 校验
```

### 3.2 Zod 写法

```ts
// dto/create-user.dto.ts
import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

// 控制器(需手写 pipe 或 nestjs-zod)
@Post()
@UsePipes(new ZodValidationPipe(CreateUserDtoSchema))
create(@Body() dto: CreateUserDto) { ... }

// 类型推断:z.infer 拿到精确 TS 类型
// 运行时:zod safeParse 校验
```

### 3.3 复杂度差异

| 复杂度 | class-validator | Zod |
|---|---|---|
| 简单字段 | 4 行(3 个装饰器 + 1 个类型) | 1 行 z.string() |
| 嵌套对象 | `@ValidateNested() @Type() child: ChildDto` | `z.object({ child: ChildSchema })` |
| 联合类型 | `@ValidateIf((o) => o.type === 'a')` | `z.discriminatedUnion('type', [...])` |
| 异步校验 | `@IsExist()` 自定义 | `z.string().refine(async (s) => ...)` |

---

## 4. 运行时机制对比

### 4.1 class-validator 怎么跑

```
┌────────────────────────────────────────┐
│ 1. HTTP request with JSON body         │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 2. NestJS ValidationPipe 拦截            │
│    (main.ts 注册 useGlobalPipes)        │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 3. plainToInstance(Class, plain)        │
│    (class-transformer 反序列化)          │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 4. validate(instance)                    │
│    (reflect-metadata 读装饰器)          │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 5. throw ValidationException 或         │
│    注入 controller @Body()              │
└────────────────────────────────────────┘
```

**依赖**:
- `class-validator` + `class-transformer` + `reflect-metadata` + NestJS

### 4.2 Zod 怎么跑

```
┌────────────────────────────────────────┐
│ 1. HTTP request with JSON body         │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 2. ZodValidationPipe 拦截                │
│    (或 nestjs-zod 全局 pipe)            │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 3. schema.safeParse(plain)              │
│    (纯函数,无反射)                      │
└────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────┐
│ 4. throw BadRequestException            │
│    或注入 controller @Body()           │
└────────────────────────────────────────┘
```

**依赖**:
- `zod` + (可选 `nestjs-zod` 桥接包)

---

## 5. 类型推断深度对比

### 5.1 class-validator 类型推断问题

```ts
class CreateUserDto {
  @IsString() @MinLength(3) username: string;
}

// 问题 1: TS 类型必须手写,跟装饰器可能不一致
// TS 说是 string,装饰器说 min length 3 → 漏了运行时校验

// 问题 2: @IsOptional() + ?: 类型可能不一致
@IsOptional() @IsString() email?: string;
// TS:email 可能是 undefined 或 string
// 装饰器:undefined 时不校验,string 时校验 IsString
// → 类型和行为一致,但要小心 @IsOptional + @IsString 顺序

// 问题 3:嵌套对象用 class-transformer 二次转换
class AddressDto { @IsString() city: string; }
class UserDto {
  @ValidateNested() @Type(() => AddressDto)  // ← 必须 @Type
  address: AddressDto;
}
```

### 5.2 Zod 类型推断优势

```ts
const Schema = z.object({
  username: z.string().min(3),
  email: z.string().email().optional(),
  address: z.object({ city: z.string() }),  // ← 嵌套无需额外
});

type Inferred = z.infer<typeof Schema>;
// {
//   username: string;
//   email?: string | undefined;
//   address: { city: string };
// }

// schema 改了类型自动跟
const Schema2 = z.object({
  username: z.string().min(5),  // 改这里
});
type Inferred2 = z.infer<typeof Schema2>;
// { username: string }  ← 类型也变了
```

**核心优势**:**schema 是 single source of truth**,TS 类型永远跟运行时一致。

---

## 6. 嵌套 + 复杂校验

### 6.1 嵌套对象

**class-validator**:
```ts
class AddressDto {
  @IsString() city: string;
  @IsString() @Length(5, 100) street: string;
}

class UserDto {
  @IsString() name: string;
  @ValidateNested() @Type(() => AddressDto)  // ← @Type 必填
  address: AddressDto;
}
```

**Zod**:
```ts
const AddressSchema = z.object({
  city: z.string(),
  street: z.string().min(5).max(100),
});

const UserSchema = z.object({
  name: z.string(),
  address: AddressSchema,  // ← 直接用,无需额外
});
```

### 6.2 联合类型(discriminatedUnion)

**class-validator**(麻烦):
```ts
class UserA {
  @IsString() type: 'a';
  @IsString() aField: string;
}

class UserB {
  @IsString() type: 'b';
  @IsNumber() bField: number;
}

// 用 @ValidateIf 实现
class UserUnion {
  @IsIn(['a', 'b']) type: 'a' | 'b';
  @ValidateIf(o => o.type === 'a') @IsString() aField?: string;
  @ValidateIf(o => o.type === 'b') @IsNumber() bField?: number;
}
```

**Zod**(原生):
```ts
const UserUnion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), aField: z.string() }),
  z.object({ type: z.literal('b'), bField: z.number() }),
]);
```

### 6.3 异步校验(查 DB 是否存在)

**class-validator**(自定义装饰器):
```ts
@ValidatorConstraint()
class IsEmailUnique implements ValidatorConstraintInterface {
  async validate(email: string) {
    const exists = await db.select().from(users).where(eq(users.email, email));
    return !exists.length;
  }
}

class CreateUserDto {
  @IsEmail() @IsEmailUnique()  // ← 自定义装饰器
  email: string;
}
```

**Zod**(`.refine` 异步):
```ts
const CreateUserSchema = z.object({
  email: z.string().email().refine(
    async (email) => {
      const exists = await db.select().from(users).where(eq(users.email, email));
      return !exists.length;
    },
    { message: 'Email already exists' }
  ),
});
```

---

## 7. 错误处理

### 7.1 class-validator 错误格式

```ts
// ValidationPipe 默认 throw 400
{
  statusCode: 400,
  message: ['username must be longer than or equal to 3 characters'],
  error: 'Bad Request'
}
```

**结构化**:
```ts
import { ValidationPipe } from '@nestjs/common';

// 全局配置
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // 自动剔除 DTO 没声明的字段
  forbidNonWhitelisted: true,  // 多余字段直接 400
  transform: true,             // 自动转 DTO class
  errorHttpStatusCode: 422,    // 自定义状态码
}));
```

### 7.2 Zod 错误格式

```ts
const result = Schema.safeParse(input);
if (!result.success) {
  console.log(result.error.flatten());
  // {
  //   formErrors: [],
  //   fieldErrors: {
  //     username: ['String must contain at least 3 character(s)'],
  //     email: ['Invalid email']
  //   }
  // }
}
```

**结构化更好**:`flatten().fieldErrors` 直接是按字段分组的对象,前端展示友好。

### 7.3 NestJS 集成(ZodValidationPipe)

```ts
// apps/auth-service/src/common/zod-validation.pipe.ts
import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}

// 用法
@Post()
@UsePipes(new ZodValidationPipe(CreateUserDtoSchema))
create(@Body() dto: CreateUserDto) { ... }
```

---

## 8. 跟 NestJS 集成

### 8.1 class-validator(NestJS 默认)

```ts
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
}));

// 控制器
@Post()
create(@Body() dto: CreateUserDto) { ... }
// ↑ 自动通过 ValidationPipe 校验
```

**零额外代码**,装 `@nestjs/common` 就有了。

### 8.2 Zod(两种集成方式)

**方式 A · 手写 pipe(推荐,轻量)**

```ts
// 见 §7.3
@UsePipes(new ZodValidationPipe(Schema))
```

**方式 B · nestjs-zod 包(全自动化)**

```bash
pnpm add nestjs-zod
```

```ts
// main.ts
import { ZodValidationPipe } from 'nestjs-zod';

app.useGlobalPipes(new ZodValidationPipe());  // ← 全局,不需要每个 controller 加
```

```ts
// DTO
import { createZodDto } from 'nestjs-zod';

export const CreateUserDto = createZodDto(CreateUserDtoSchema);

// 控制器
@Post()
create(@Body() dto: CreateUserDto) { ... }
// ↑ 自动用 schema 校验
```

**对比**:

| 方案 | 优 | 劣 |
|---|---|---|
| **手写 pipe** | 0 新依赖,代码清晰 | 每个 controller 加 `@UsePipes` |
| **nestjs-zod 包** | 0 模板代码 | 多 1 个依赖,版本/兼容性风险 |

**nest-search 选**:**手写 pipe**(0022 决策,理由:少 1 依赖)。

---

## 9. 跟 Drizzle 集成

### 9.1 class-validator + Drizzle(零联动)

```ts
// Drizzle schema
export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  email: varchar('email', { length: 100 }),
  role: mysqlEnum('role', ['admin', 'user']).default('user'),
});

// 手写 DTO(跟 schema 重复定义字段)
import { IsString, MinLength, MaxLength, IsEmail, IsEnum, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(50) username: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(['admin', 'user']) role?: 'admin' | 'user';
}

// 字段名 / 长度 / 可选性都得手抄一遍
// 改 schema 时容易忘改 DTO
```

### 9.2 Zod + drizzle-zod(自动联动)

```ts
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from '../schema/users';

// 自动从 schema 推断
export const InsertUserDbSchema = createInsertSchema(users, {
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

export type InsertUserDb = z.infer<typeof InsertUserDbSchema>;
```

**好处**:
- 字段名 / 长度 / 可选性**自动跟 schema 同步**
- 改 schema,drizzle-zod 推断的 DTO **自动**更新
- TS 类型 = schema 推断,**不会有不一致**

### 9.3 drizzle-zod 已知限制(0022 撞过)

| 限制 | 解决 |
|---|---|
| `.omit().extend()` 类型推断失效(0.8.x) | 手写 API DTO,字段名跟 DB 对齐 |
| JSON 字段推断成 `unknown` | 手动覆盖 `metadata: z.object({...})` |
| 自定义 enum 类型 | 覆盖 `role: z.enum([...])` |

详见 `docs/teaching/reference/drizzle-orm-reference.md` §8。

---

## 10. 性能基准

实测条件:1000 次简单对象校验(3 字段:string + number + boolean)

| 库 | 时间(ms) | 备注 |
|---|---|---|
| **Zod 3.x** | ~3ms | 纯 JS,无反射 |
| **class-validator** | ~25ms | reflect-metadata 反射开销 |
| **class-validator + transformer** | ~40ms | 双重反射 |

**结论**:Zod 快约 **8-13 倍**。但单请求差异 < 30ms,真实 prod 几乎无感。

**bundle size**:

| 包 | minified | gzipped |
|---|---|---|
| zod | 12KB | 4KB |
| class-validator + class-transformer | 28KB | 9KB |
| @nestjs/common(已含)| 50KB | 18KB |

---

## 11. 迁移路径(class-validator → Zod)

### 11.1 推荐渐进式迁移(3 步)

**Step 1 · 并排写**

```ts
// 老 DTO 保留
export class CreateUserDtoOld {
  @IsString() @MinLength(3) username: string;
  // ...
}

// 新 Zod DTO 写
export const CreateUserDtoSchema = z.object({
  username: z.string().min(3),
  // ...
});

// 控制器用新的
@Post()
@UsePipes(new ZodValidationPipe(CreateUserDtoSchema))
create(@Body() dto: CreateUserDto) { ... }

// 老 DTO 还在但没人用
```

**Step 2 · 逐个 endpoint 切换**

按 controller / service 切:
- register: 切
- login: 留
- /me: 切
- ...

每个切完跑测试,确认没破坏。

**Step 3 · 删 class-validator**

```bash
# 所有 endpoint 切完
pnpm remove class-validator class-transformer
```

### 11.2 迁移 checklist

- [ ] 装 `zod` + (可选 `nestjs-zod`)
- [ ] 写 `ZodValidationPipe` (10 行)
- [ ] 选 1 个不重要的 endpoint 做试点
- [ ] 测试通过后推广到所有 endpoint
- [ ] 跑 `grep class-validator` 找残留
- [ ] `pnpm remove class-validator class-transformer`
- [ ] 删所有 `@Body() dto: SomeDtoClass`(改成 `dto: z.infer<...>`)

---

## 12. nest-search 实战状态

### 12.1 当前(0022 后)

| 文件 | 用什么 | 备注 |
|---|---|---|
| `apps/auth-service/src/database/dto/users.dto.ts` | **drizzle-zod + 手写** | ✅ register 用 |
| `apps/auth-service/src/user/dto/login.dto.ts` | **class-validator** | 0023+ 改 |
| `apps/auth-service/src/user/dto/create-user.dto.ts` | ❌ 删了(方案 B) | — |
| `apps/auth-service/src/common/zod-validation.pipe.ts` | 手写 ZodValidationPipe | 通用 |
| **所有其他 service 的 dto** | class-validator | 0023+ 改 |

### 12.2 nest-search 选 Zod 的 3 个理由

1. **drizzle-zod 联动** — schema 改了 DTO 自动跟
2. **TS 类型推断** — schema 是 source of truth,无不一致
3. **跨 framework** — 不绑死 NestJS,以后换框架 / Edge 部署好迁移

### 12.3 完全切换时间表

| 课 | 切换内容 |
|---|---|
| **0022**(已做)| register endpoint |
| **0023** | login endpoint(替换 class-validator)|
| **0024** | /me / validate / refresh / logout endpoints |
| **0025+** | form-service / sync-service / search-service 所有 DTO |
| **未来** | 删 class-validator + class-transformer 依赖 |

---

## 🎯 一句话结论

> **class-validator = NestJS "默认",Zod = TypeScript "默认"**。
>
> nest-search 走 Zod 路线(0022 决策),原因:**drizzle-zod 联动 + TS 类型推断 + 跨 framework**。

---

## 🔗 相关链接

- [Zod 官方文档](https://zod.dev/)
- [class-validator 官方文档](https://github.com/typestack/class-validator)
- [drizzle-zod 官方](https://orm.drizzle.team/docs/zod)
- [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod)
- nest-search 0022 lesson:`docs/teaching/lessons/0022-drizzle-kit-migrations-and-zod.md`
- nest-search drizzle reference:`docs/teaching/reference/drizzle-orm-reference.md`
