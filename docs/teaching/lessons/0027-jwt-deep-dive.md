# 0027 · JWT 深入：Access Token 黑名单 + ConfigService 改造

> Phase A 第 9 课。0026 做完优雅退出,0027 补 JWT 的两个缺口：**Access Token 无法即时吊销** + **CAS_CONFIG 用 process.env 而非 ConfigService**。

## 你今天会拿到什么

1. 理解 **为什么 Refresh Token 黑名单不够**（AT 泄漏后 2h 内无法阻止）
2. 亲手实现 **Access Token 黑名单**（Redis `at_blacklist:{jti}` + 过期时间 = AT 剩余 TTL）
3. 把 **CAS_CONFIG 从 process.env 改为 ConfigService**（消除 TODO）
4. 理解 **AT + RT 双令牌架构**的设计原理
5. 21 测试还过 + 1 个 commit

---

## §1. 当前 JWT 架构

```
登录成功
    ↓
┌─────────────────────────────────────────────┐
│ Access Token (JWT)                          │
│ - 有效期: 2h                                │
│ - 存储: 响应体 { accessToken }              │
│ - 用途: Authorization: Bearer <token>       │
│ - 吊销: ❌ 无法即时吊销                      │
├─────────────────────────────────────────────┤
│ Refresh Token (UUID)                        │
│ - 有效期: 7 天                              │
│ - 存储: HTTP-only Cookie + Redis            │
│ - 用途: 刷新 AT                             │
│ - 吊销: ✅ Redis 黑名单                     │
└─────────────────────────────────────────────┘
```

**问题场景**：

```
1. 用户登录 → 拿到 AT (有效期 2h)
2. 用户登出 → RT 被黑名单,AT 无法吊销
3. 攻击者拿到 AT → 在 2h 内仍可访问 API
4. 2h 后 AT 过期 → 攻击失效
```

**企业级要求**：登出后 AT 应**立即失效**。

---

## §2. 设计决策

### 决策 1 · AT 黑名单存什么？

```ts
// 方案 A:存完整 token 字符串
key: `at_blacklist:${token}`
问题:token 太长(几百字节),浪费 Redis 内存

// 方案 B:存 jti (JWT ID)
key: `at_blacklist:${jti}`
payload 里加 jti: crypto.randomUUID()
优点:key 短,只存 jti → TTL 后自动清理
```

**选 B**。理由：
- jti 是 JWT 标准字段（RFC 7519）
- Redis key 短，内存占用小
- TTL 等于 AT 剩余有效期，过期自动删除

### 决策 2 · AT TTL 怎么设？

```ts
// 登出时,AT 可能还剩 1h59min 或只剩 1min
// 方案 A:固定 TTL (2h)
问题:黑名单条目堆积

// 方案 B:计算 AT 剩余 TTL
const decoded = jwt.decode(token);
const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
await redis.set(`at_blacklist:${jti}`, '1', 'EX', remainingTtl);
```

**选 B**。理由：
- 只在 AT 过期前存在，过期后自动清理
- 不需要手动清理黑名单

### 决策 3 · 在哪里检查黑名单？

```ts
// 方案 A:在 validateToken() 里检查
优点:集中,所有调用点自动生效
缺点:每次验证都查 Redis(性能开销)

// 方案 B:在 Guard/Controller 里检查
优点:可以只在需要的地方检查
缺点:分散,容易遗漏
```

**选 A**。理由：
- `validateToken()` 是唯一入口，不会遗漏
- Redis 查询 ~1ms，对 2h 有效期的 AT 来说可接受
- 企业级做法

---

## §3. 动手：AT payload 加 jti

### Step 1 · generateAccessToken 加 jti

```ts
// apps/auth-service/src/auth/auth.service.ts
import { randomUUID } from 'crypto';

private generateAccessToken(payload: JwtPayload): string {
  const jti = randomUUID();  // ← 新加
  return jwt.sign({ ...payload, jti }, CAS_CONFIG.jwtSecret, {
    expiresIn: CAS_CONFIG.jwtExpiresIn,
  } as any);
}
```

**改动很小**：只加一行 `const jti = randomUUID()`，然后把 jti 放进 payload。

---

## §4. 动手：AT 黑名单检查

### Step 1 · validateToken 加黑名单检查

```ts
// apps/auth-service/src/auth/auth.service.ts
async validateToken(token: string): Promise<JwtPayload | null> {
  try {
    const payload = jwt.verify(token, CAS_CONFIG.jwtSecret) as JwtPayload;

    // 检查 AT 黑名单
    if (payload.jti) {
      const blacklisted = await this.redis.get(`at_blacklist:${payload.jti}`);
      if (blacklisted) return null;  // 已被吊销
    }

    return payload;
  } catch {
    return null;
  }
}
```

### Step 2 · logout 加 AT 黑名单

```ts
// apps/auth-service/src/auth/auth.service.ts
async logout(refreshToken: string, accessToken?: string) {
  // 1. 现有逻辑:RT 黑名单
  const rtData = await this.redis.get(`refresh_token:${refreshToken}`);
  if (rtData) {
    const { userId } = JSON.parse(rtData);
    const ttl = await this.redis.ttl(`refresh_token:${refreshToken}`);
    await this.redis.set(`refresh_token_blacklist:${refreshToken}`, '1', 'EX', ttl);
    await this.redis.del(`refresh_token:${refreshToken}`);
  }

  // 2. 新增:AT 黑名单
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as JwtPayload;
      if (decoded?.jti && decoded?.exp) {
        const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingTtl > 0) {
          await this.redis.set(`at_blacklist:${decoded.jti}`, '1', 'EX', remainingTtl);
        }
      }
    } catch {
      // AT 无效,忽略
    }
  }
}
```

### Step 3 · Controller 传 AT 给 logout

```ts
// apps/auth-service/src/auth/auth.controller.ts
@Post('logout')
async logout(
  @Body() body: { refreshToken?: string },
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const refreshToken = body.refreshToken || this.extractRefreshTokenFromCookie(req);
  // 从 Authorization header 取 AT
  const accessToken = req.headers.authorization?.replace('Bearer ', '');

  if (!refreshToken) {
    throw new BadRequestException('Refresh token is required');
  }

  await this.authService.logout(refreshToken, accessToken);
  // ... 清除 cookie
}
```

---

## §5. 动手：CAS_CONFIG 改用 ConfigService

### 现状问题

```ts
// apps/auth-service/src/libs/shared/constants/cas.ts
// ❌ module load 时就读 process.env,不走 Zod 校验
export const CAS_CONFIG = {
  jwtSecret: process.env.JWT_SECRET || 'nest-search-jwt-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  // ...
};
```

### 改造：注入 ConfigService

```ts
// 方案 A:保持常量,但用 ConfigService 校验后的值
// 在 auth.module.ts 里 provide CAS_CONFIG

// 方案 B:直接在 service 里用 configService.getOrThrow()
// 更简单,不需要额外 provider
```

**选 B**。在 `auth.service.ts` 构造函数里直接用 `ConfigService`：

```ts
// apps/auth-service/src/auth/auth.service.ts
constructor(
  private readonly redis: RedisService,
  private readonly userService: UserService,
  private readonly config: ConfigService,  // ← 新加
) {
  this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  this.jwtExpiresIn = this.config.getOrThrow<string>('JWT_EXPIRES_IN');
}
```

然后把 `CAS_CONFIG.jwtSecret` 替换为 `this.jwtSecret`。

---

## §6. Quiz

**Q1: 为什么 Refresh Token 黑名单不够，还需要 Access Token 黑名单？**

A) 因为 RT 黑名单有 bug
B) 因为 AT 在 2h 有效期内仍可使用，即使 RT 已被黑名单
C) 因为 AT 比 RT 更安全

**Q2: AT 黑名单的 key 为什么用 jti 而不是完整 token？**

A) 因为 jti 更安全
B) 因为 jti 短，节省 Redis 内存，且是 JWT 标准字段
C) 因为完整 token 不能存 Redis

**Q3: AT 黑名单的 TTL 为什么用剩余有效期而不是固定值？**

A) 因为固定值会导致黑名单条目无限堆积
B) 因为剩余 TTL 更准确，AT 过期后自动清理
C) 两者都是

---

## §7. Commit Message

```
feat(auth-service): AT 黑名单 + CAS_CONFIG ConfigService 改造

- generateAccessToken 加 jti (randomUUID)
- validateToken 检查 at_blacklist:{jti}
- logout 同时黑名单 AT (剩余 TTL)
- CAS_CONFIG 改用 ConfigService 注入
- 21 测试还过
```

---

## §8. 跨节链接

- [0026 · 优雅退出](./0026-graceful-shutdown.md) — 上一课
- [0028 · 健康检查](./0028-health-check-deep-dive.md) — 下一课
- [Redis 参考](./reference/drizzle-orm-reference.md) — AT 黑名单用 Redis SET + TTL
