# 0056 · RBAC 装饰器：细粒度权限系统

> Phase D 第 2 课。给 nest-search 加 **`@RequirePermission()`** 装饰器和 **PermissionGuard**，实现细粒度权限控制。

## 你今天会拿到什么

1. 设计 **Permission 系统**（resource × action 形式）
2. 实现 **`@RequirePermission()` 装饰器**
3. 实现 **`PermissionGuard`** 鉴权
4. nest-search 业务接入示例
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 当前 nest-search 权限问题

```
当前: JWT 里有 role 字段
  - role: 'admin' | 'user'
  - 一刀切

问题:
  ❌ "任何 user 都能调 /api/admin/*"
  ❌ "user 只能看自己的订单, admin 看所有" → 没法区分
  ❌ "产品 owner 才能编辑" → 没法表达
  ❌ 改权限要改代码（每个 if 判断）
```

### 1.2 解决：RBAC + Permission

```
RBAC (Role-Based Access Control):
  User → Role → Permission
  user  → 角色 → 具体权限

Permission (权限):
  格式: "resource:action"
  例: "product:read"  读产品
      "product:write" 改产品
      "user:manage"   管理用户
```

---

## §2. 设计 Permission 系统

### 2.1 Permission 类型

```ts
// libs/shared/src/types/permission.ts
export type Permission = 
  // 产品
  | 'product:read'
  | 'product:write'
  | 'product:delete'
  // 订单
  | 'order:read'
  | 'order:write'
  // 用户
  | 'user:read'
  | 'user:manage'
  // 同步
  | 'sync:trigger'
  // 系统
  | 'system:admin';
```

### 2.2 角色 → 权限映射

```ts
// libs/shared/src/constants/permissions.ts
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['system:admin'],  // 超级权限
  manager: [
    'product:read',
    'product:write',
    'order:read',
    'order:write',
    'user:read',
    'sync:trigger',
  ],
  user: [
    'product:read',
    'order:read',
    'order:write',
  ],
  guest: [
    'product:read',
  ],
};

// 辅助函数
export function hasPermission(role: string, required: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('system:admin') || perms.includes(required);
}
```

### 2.3 角色 vs Permission 关系

```
用户  ──→  角色（admin/user/...）
                │
                ↓
            多个 Permission（product:read, ...）
                │
                ↓
         关联到具体 endpoint
```

---

## §3. 装饰器实现

### 3.1 `@RequirePermission()` 装饰器

```ts
// libs/shared/src/decorators/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { Permission } from '../types/permission';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (...perms: Permission[]) =>
  SetMetadata(PERMISSION_KEY, perms);
```

### 3.2 多个权限（AND 语义）

```ts
// 多个权限: 必须全部满足 (AND)
@RequirePermission('product:read', 'product:write')
@Post('products')
createProduct() { ... }
// 需要同时有 product:read 和 product:write 权限
```

### 3.3 任一权限（OR 语义，扩展）

```ts
// 高级: 任一权限满足即可 (OR)
@RequireAnyPermission('product:read', 'order:read')
// 装饰器再做一个
```

---

## §4. Guard 实现

### 4.1 `PermissionGuard`

```ts
// libs/shared/src/guards/permission.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../types/permission';
import { ROLE_PERMISSIONS } from '../constants/permissions';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // 1. 拿装饰器要求的权限
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // 2. 没有装饰器, 不需要权限检查
    if (!required || required.length === 0) return true;

    // 3. 拿用户 (JWT 验证后挂到 request.user)
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('未认证');
    }

    // 4. 拿用户角色的所有权限
    const userPerms = ROLE_PERMISSIONS[user.role] || [];

    // 5. 检查 admin (超级权限)
    if (userPerms.includes('system:admin')) return true;

    // 6. 检查每个 required 权限
    for (const perm of required) {
      if (!userPerms.includes(perm)) {
        throw new ForbiddenException(
          `权限不足: 缺少 ${perm} 权限`,
        );
      }
    }

    return true;
  }
}
```

### 4.2 与 CasGuard 配合

```ts
// controller
@UseGuards(CasGuard, PermissionGuard)  // 先 CasGuard 验证 JWT, 再 PermissionGuard 检查权限
@Controller('api/admin/products')
export class AdminProductController { ... }
```

---

## §5. nest-search 接入

### 5.1 sync-service 接入

```ts
// apps/sync-service/src/sync/sync.controller.ts
import { RequirePermission } from '@app/shared/decorators/require-permission.decorator';
import { PermissionGuard } from '@app/shared/guards/permission.guard';

@UseGuards(CasGuard, PermissionGuard)
@Controller('api/sync')
export class SyncController {

  // 任何登录用户都能触发同步 (有 product:read 权限)
  @RequirePermission('product:read')
  @Post('full/:businessLine')
  triggerFullSync() { ... }

  // 只有 admin 能强制同步
  @RequirePermission('system:admin')
  @Post('force')
  forceSync() { ... }
}
```

### 5.2 auth-service 接入（用户管理）

```ts
// apps/auth-service/src/cas/cas.controller.ts
@UseGuards(CasGuard, PermissionGuard)
@Controller('api/admin')
export class AdminController {

  // 只有 admin 能管理用户
  @RequirePermission('user:manage')
  @Get('users')
  listAllUsers() { ... }

  // admin 或 manager 都能看
  @RequirePermission('user:read')
  @Get('users/:id')
  getUser() { ... }
}
```

### 5.3 search-service 接入

```ts
// apps/search-service/src/search/search.controller.ts
@UseGuards(CasGuard, PermissionGuard)
@Controller('api/search/:businessLine')
export class SearchController {

  // 任何登录用户都能搜
  @RequirePermission('product:read')
  @Get('products')
  searchProducts() { ... }

  // 公开 (无装饰器 = 不需要权限)
  // 例如公开的搜索结果页
  @Get('public/products')
  publicSearch() { ... }
}
```

---

## §6. 单元测试

### 6.1 PermissionGuard 测试

```ts
// libs/shared/src/guards/permission.guard.spec.ts
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PermissionGuard, Reflector],
    }).compile();
    guard = module.get(PermissionGuard);
    reflector = module.get(Reflector);
  });

  function mockContext(user: any, required?: string[]) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  it('无装饰器: 通过', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ role: 'guest' }))).toBe(true);
  });

  it('admin 通过任何权限', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['product:delete']);
    expect(guard.canActivate(mockContext({ role: 'admin' }))).toBe(true);
  });

  it('user 缺少权限抛 403', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user:manage']);
    expect(() => 
      guard.canActivate(mockContext({ role: 'user' }))
    ).toThrow(/权限不足/);
  });
});
```

---

## §7. nest-search 收益

### 7.1 改造前

```
现状:
  - role: 'admin' | 'user' (粗粒度)
  - 业务代码每个 if 判断:
    if (user.role === 'admin') { ... }
  - 新增权限要改所有 if

问题:
  ❌ 重复代码
  ❌ 容易遗漏
  ❌ 难维护
```

### 7.2 改造后

```
新增 @RequirePermission('product:write'):
  - 装饰器声明权限
  - Guard 自动检查
  - 业务代码不写 if

新增权限:
  - 加一个字符串即可 ('product:delete')
  - 加到 ROLE_PERMISSIONS 映射
  - 完成, 不改业务代码
```

### 7.3 5 服务接入清单

| 服务 | 接入 RBAC | 价值 |
|------|----------|------|
| **auth-service** | ✅ 用户管理 | 高 |
| **sync-service** | ✅ 同步触发 | 中 |
| **search-service** | ✅ 搜索 + 聚合 | 中 |
| **form-service** | ✅ 表单权限 | 中 |
| **gateway** | ✅ 路由级 | 中 |

---

## §8. 实战 demo

### 8.1 跑测试

```bash
# 1. 单测
pnpm test libs/shared/src/guards/permission.guard.spec.ts

# 2. 验证 admin 通过
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <admin-jwt>"
# 200 OK

# 3. 验证 user 失败
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <user-jwt>"
# 403 Forbidden: 权限不足: 缺少 user:manage 权限
```

### 8.2 端到端

```ts
// 流程:
// 1. user 登录 → 拿到 JWT (role: 'user')
// 2. user 调 /api/admin/users (装饰器要求 user:manage)
// 3. CasGuard 验证 JWT 成功 (有 user)
// 4. PermissionGuard 检查 user 权限
// 5. user 没有 user:manage → 抛 403
```

---

## §9. Quiz

**Q1: Permission 格式推荐用什么？**

A) `admin`, `user`, `guest` (角色名)
B) `resource:action` 如 `product:read`
C) 任何字符串

**Q2: `@RequirePermission('product:read', 'product:write')` 默认是 AND 还是 OR？**

A) AND (全部满足)
B) OR (任一满足)

**Q3: 装饰器没写在 controller 上, PermissionGuard 怎么处理？**

A) 拒绝访问
B) 直接通过
C) 抛 500

---

## §10. Commit Message

```
feat(shared): 0056 RBAC 装饰器 + Guard

共享库 (libs/shared):
- types/permission.ts: Permission 类型
- constants/permissions.ts: 角色 → 权限映射
- decorators/require-permission.decorator.ts
- guards/permission.guard.ts
- guards/permission.guard.spec.ts: 单测

5 服务接入:
- auth-service / sync-service / search-service
- 加 PermissionGuard 到关键端点
- admin-only 端点用 @RequirePermission('system:admin')
- 21 测试还过
```

---

## §11. 跨节链接

- [0055 · OAuth 2.0](./0055-oauth2-oidc.md) — 上一课
- [0057 · WebSocket](./0057-websockets.md) — 下一课
- [permission.guard.ts](../../libs/shared/src/guards/permission.guard.ts) — 核心实现
