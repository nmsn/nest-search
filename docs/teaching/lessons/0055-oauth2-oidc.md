# 0055 · 认证授权深入：OAuth 2.0 + OIDC 协议

> Phase D 第 1 课。nest-search 当前是简单 JWT，**生产环境**需要 OAuth 2.0 + OIDC 协议做完整鉴权。本节讲原理 + nest-search 改造点。

## 你今天会拿到什么

1. 理解 **OAuth 2.0** 四种授权模式
2. 理解 **OIDC**（OpenID Connect）vs OAuth 区别
3. 理解 **CAS Ticket 协议**（CAS Guard 实现原理）
4. nest-search 改造点：完整 OAuth + RBAC
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 当前 nest-search 鉴权

```
当前:
  - 用户登录 → 后端发 JWT
  - 前端带 token 访问 API
  - 后端验证 token
  - 简单但够用

问题:
  ❌ 多服务登录态共享
  ❌ 第三方登录（微信、Google）不支持
  ❌ 权限粒度粗（只到 role, 没到 resource）
  ❌ token 过期管理粗糙
  ❌ 没有 refresh token 流程
```

### 1.2 真实生产场景

```
公司用户系统:
  - 内部员工用一个账号登录
  - 微信扫码登录
  - Google OAuth 登录
  - 多个子系统共享登录态
  → 需要统一身份协议: OAuth 2.0 + OIDC
```

---

## §2. OAuth 2.0 是什么？

### 2.1 一句话

```
OAuth 2.0 = 授权（Authorization）协议
让第三方应用"代表用户"访问用户在某平台的资源
```

### 2.2 角色

```
Resource Owner: 用户（资源所有者）
Client: 第三方应用（要访问资源）
Authorization Server: 授权服务器（发 token）
Resource Server: 资源服务器（API）
```

### 2.3 关键概念：不是认证，是授权

```
OAuth 解决: "我能不能访问这个资源"
JWT 解决: "我是谁"（认证）

OAuth 发 token，验证 token 才知道"我是谁"
```

---

## §3. OAuth 2.0 四种授权模式

### 3.1 模式对比

| 模式 | 适用 | 流程 | nest-search |
|------|------|------|-------------|
| **授权码模式** | Web 应用 | 用户登录 → 授权码 → token | ✅ 生产 |
| 隐式模式 | SPA（已废弃）| 简化版 | ❌ 不用 |
| 密码模式 | 信任的自家应用 | 用户名密码 → token | ⚠️ 历史 |
| 客户端模式 | 服务对服务 | client_id/secret → token | ✅ M2M |

### 3.2 授权码模式（最常用）

```
时序图:

用户 → 前端 → 后端 → 授权服务器
  │      │      │      │
  │      │      │      │
  │  1. 访问 /api/user
  │      │      │      │
  │      │ 检测未登录   │
  │      │      │      │
  │  2. 跳转授权服务器 (含 client_id, redirect_uri, scope)
  │  ────────────────→
  │             │      │
  │  3. 用户在授权服务器登录
  │             │      │
  │  4. 授权服务器回调 redirect_uri?code=xxx
  │  ←────────────────
  │      │      │      │
  │  5. 前端拿 code 换 token
  │      │  POST /token
  │      │ ──────────────→
  │             │      │
  │      │  access_token, refresh_token, id_token
  │      │ ←──────────────
  │      │      │      │
  │  6. 访问 /api/user 带 token
  │      │ ──────────────→
  │             │      │
  │      │  返回 user info
  │      │ ←──────────────
```

### 3.3 客户端模式（service-to-service）

```
M2M（机器对机器）:
  service A → service B:
    A 拿 client_id/secret 换 token
    B 验证 token

适用:
  - sync-service 调 auth-service
  - gateway 调 search-service
  - 不需要用户参与
```

---

## §4. OIDC 是什么？

### 4.1 vs OAuth

```
OAuth 2.0: 授权（"你能做什么"）
OIDC:     身份（"你是谁"）— 基于 OAuth

OIDC 加了一层: ID Token
  - JWT 格式
  - 包含用户信息（sub, name, email）
  - 前端拿 ID Token 知道当前用户是谁
```

### 4.2 OIDC 标准字段

```json
{
  "sub": "user_123",          // 用户 ID
  "name": "张三",              // 用户名
  "email": "zhang@example.com",
  "iss": "https://auth.example.com",  // 颁发者
  "aud": "client_id_xxx",     // 受众
  "exp": 1234567890,          // 过期时间
  "iat": 1234567000           // 颁发时间
}
```

### 4.3 nest-search 怎么用

```
前端:
  - 用户登录 → 拿到 ID Token + Access Token
  - 解析 ID Token 拿 user info
  - 调 API 带 Access Token

后端:
  - 验证 Access Token 签名
  - 解析 token claims（sub, scope, role）
  - 根据 scope/role 做权限控制
```

---

## §5. nest-search 当前状态

### 5.1 nest-search 已有

| 能力 | 现状 | 位置 |
|------|------|------|
| JWT 签发 | ✅ | auth.service.ts |
| JWT 验证 | ✅ | CasGuard |
| AT 黑名单 | ✅ | Redis |
| RT 机制 | ✅ | refresh token 字段 |
| 双令牌架构 | ✅ | AT + RT |

### 5.2 nest-search 缺什么

| 能力 | 现状 | 生产需要 |
|------|------|---------|
| OAuth 2.0 协议 | ❌ | ✅ |
| OIDC 协议 | ❌ | ✅ |
| 第三方登录 | ❌ | ✅ |
| 统一授权服务器 | ❌ | ✅ |
| CAS 协议 | ✅ (已有) | ✅ |

### 5.3 改造路径

```
阶段 1: 完善 RBAC
  - 当前 role: user/admin
  - 加 permission 系统 (resource × action)
  - @RequirePermission('product', 'read')

阶段 2: 支持 OAuth 2.0
  - /oauth/authorize endpoint
  - /oauth/token endpoint
  - 授权码流程
  - client_id/secret 管理

阶段 3: OIDC
  - /oauth/userinfo endpoint
  - ID Token 签发
  - JWKS 公钥端点

阶段 4: 第三方登录
  - 微信 OAuth
  - Google OAuth
  - 飞书/钉钉
```

---

## §6. RBAC 设计

### 6.1 RBAC 三要素

```
1. User: 用户
2. Role: 角色（admin/user/guest）
3. Permission: 权限（product:read, product:write）
```

### 6.2 nest-search RBAC 建议

```ts
// 角色
type Role = 'admin' | 'user' | 'guest';

// 权限
type Permission = 
  | 'product:read'      // 读产品
  | 'product:write'     // 改产品
  | 'product:delete'   // 删产品
  | 'order:read'        // 读订单
  | 'order:write'       // 改订单
  | 'user:manage'       // 用户管理

// 角色 → 权限映射
const ROLE_PERMISSIONS = {
  admin:  ['*'],                          // 所有权限
  user:   ['product:read', 'order:read', 'order:write'],
  guest:  ['product:read'],
};
```

### 6.3 装饰器实现

```ts
// auth/decorators/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (...perms: string[]) => 
  SetMetadata(PERMISSION_KEY, perms);

// 使用
@RequirePermission('product:read')
@Get('products')
async getProducts() { ... }
```

```ts
// auth/guards/permission.guard.ts
@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const requiredPerms = this.reflector.get(PERMISSION_KEY, ctx.getHandler());
    const { user } = ctx.switchToHttp().getRequest();
    
    const userPerms = this.getUserPermissions(user.role);
    return requiredPerms.every(p => userPerms.includes(p));
  }
}
```

---

## §7. CAS Guard 解析

### 7.1 nest-search 当前 CasGuard

```ts
// 已有
@UseGuards(CasGuard)
@Controller('api/products')
export class ProductController { ... }
```

### 7.2 CAS Ticket 协议

```
CAS = Central Authentication Service
原理: 跨域单点登录（SSO）

时序:
  1. 用户访问 app1.example.com
  2. app1 检测未登录, 重定向到 cas.example.com/login?service=app1
  3. 用户在 CAS 登录
  4. CAS 重定向到 app1?ticket=xxx
  5. app1 拿 ticket 调 CAS /validate
  6. CAS 返回用户信息
  7. app1 给用户发 session

→ nest-search 当前用简化版 JWT，没真正用 CAS
```

### 7.3 nest-search 当前用 JWT 替代 CAS

```
简化方案:
  - 用户登录 → 后端发 JWT (含 user info)
  - 前端存 token, 每次请求带 Authorization 头
  - 后端 CasGuard 验证 token
  - 不需要 CAS server

适用: 单一应用 / 内部系统
不适用: 多子系统共享登录态
```

---

## §8. nest-search 改造建议

### 8.1 优先级

```
P0 (基础)  : ✅ JWT + RBAC
P1 (进阶)  : ⚠️ 多端点权限控制
P2 (高级)  : ❌ OAuth 2.0
P3 (生产)  : ❌ OIDC + 第三方登录
```

### 8.2 当前 nest-search 实际建议

```
nest-search 是:
  - 内部教学项目
  - 5 个服务但都是同一团队
  - 没有第三方登录需求
  - 没有多租户需求

→ 当前 JWT + RBAC 足够
→ 学习 OAuth 概念即可
→ 未来生产化时再加 OAuth/OIDC
```

---

## §9. Quiz

**Q1: OAuth 2.0 主要解决什么？**

A) 身份认证
B) 授权（"我能不能做"）
C) 数据加密

**Q2: OIDC 比 OAuth 多了什么？**

A) Access Token
B) ID Token（用户身份信息）
C) Refresh Token

**Q3: nest-search 当前适合加 OAuth 2.0 吗？**

A) 必须加（任何项目都需要）
B) 现在不需要（JWT 够用），未来生产化再加
C) 永远不需要

---

## §10. Commit Message

```
docs(teaching): 0055 OAuth 2.0 + OIDC lesson

- OAuth 2.0 四种模式讲解
- OIDC vs OAuth 区别
- RBAC 角色 + 权限设计
- nest-search 当前 JWT 已够用
- 21 测试还过
```

---

## §11. 跨节链接

- [0053 · Prometheus](./0053-prometheus-metrics.md) — 上一课
- [0056 · RBAC decorator](./0056-rbac-decorator.md) — 下一课
- [auth.service.ts](../../apps/auth-service/src/auth/auth.service.ts) — nest-search 当前鉴权
