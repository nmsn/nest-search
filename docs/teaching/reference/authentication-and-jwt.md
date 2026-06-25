# 认证体系参考：JWT + 双令牌架构

> 参考文档，配合 0027 lesson 使用。覆盖 AT/RT 设计、JWT 原理、有无状态对比。

---

## 1. 双令牌架构

```
登录成功 → 签发两个令牌:

┌─────────────────────────────────────────────┐
│ Access Token (JWT)                          │
│ - 载体: JWT (自包含,有签名)                  │
│ - 有效期: 2h (短)                           │
│ - 存储: 客户端内存 / 响应体                  │
│ - 用途: 每次请求带 Authorization: Bearer     │
│ - 验证: 验签名 (本地,不查 Redis)             │
│ - 吊销: 黑名单 (Redis at_blacklist:{jti})   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Refresh Token (UUID)                        │
│ - 载体: 随机 UUID (不透明,无签名)            │
│ - 有效期: 7 天 (长)                         │
│ - 存储: HTTP-only Cookie + Redis            │
│ - 用途: AT 过期后换新的 AT                   │
│ - 验证: 查 Redis                            │
│ - 吊销: 直接删除 Redis key                  │
└─────────────────────────────────────────────┘
```

### 为什么需要两个？

| 维度 | Access Token | Refresh Token |
|------|-------------|---------------|
| 频率 | 高（每次请求） | 低（AT 过期时） |
| 验证方式 | 验签名（本地计算） | 查 Redis |
| 性能 | ~0.01ms | ~1ms |
| 吊销 | 黑名单（间接） | 删除 key（直接） |
| Redis 依赖 | 无（签名验证） | 有（存储 + 查询） |

**设计原则**：AT 无状态高频验证，RT 有状态低频续签。

---

## 2. JWT (JSON Web Token)

### 结构

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsInVzZXJuYW1lIjoiYWxpY2UifQ.SflKxwRJSMeKKF2QT4fwp
|_______ Header _________|_______________ Payload __________________|________________ Signature _________________|

Header:    {"alg": "HS256", "typ": "JWT"}
Payload:   {"sub": 1, "username": "alice", "role": "user", "jti": "xxx", "exp": 1782395200}
Signature: HMAC-SHA256(base64(header) + "." + base64(payload), 密钥)
```

### 签名算法

```
HMAC-SHA256:
  输入: Header.Payload + 密钥
  输出: 32 字节签名

验证:
  1. 拆分 Token → Header.Payload.Signature
  2. 用密钥对 Header.Payload 重新算 HMAC-SHA256
  3. 比较计算结果和 Signature
  4. 一致 → 有效; 不一致 → 被篡改 → 拒绝
```

### 关键字段

| 字段 | 含义 | 必填 |
|------|------|------|
| `sub` | 用户 ID (subject) | ✅ |
| `username` | 用户名 | 自定义 |
| `role` | 角色 (admin/user) | 自定义 |
| `jti` | JWT ID (唯一标识) | 可选(黑名单用) |
| `iat` | 签发时间 (issued at) | 自动 |
| `exp` | 过期时间 (expiration) | 自动 |

### 代码位置

| 操作 | 文件 | API |
|------|------|-----|
| 签发 AT | `auth.service.ts:136` | `jwt.sign(payload, secret, options)` |
| 验证 AT | `auth.service.ts:156` | `jwt.verify(token, secret)` |
| 解码 AT | `auth.service.ts:110` | `jwt.decode(token)` (不验签) |
| 验证 AT | `auth.controller.ts:113` | `jwt.verify(token, secret)` (/me 端点) |

### verify vs decode

```
verify: 验签名 + 检查过期 → 安全,用于处理用户请求
decode: 只 Base64 解码 → 不安全,只用于已信任场景
```

---

## 3. 有状态 vs 无状态

```
无状态 (Stateless):
  服务端不存储会话信息
  Token 自包含所有信息
  验证时不需要查外部存储
  例: JWT

有状态 (Stateful):
  服务端存储会话信息
  Token 只是标识符(ID)
  验证时需要查外部存储
  例: Session ID, UUID + Redis
```

### 对比

| 维度 | 无状态 (JWT) | 有状态 (UUID+Redis) |
|------|------------|-------------------|
| 验证速度 | ~0.01ms (本地计算) | ~1ms (网络+Redis) |
| 水平扩展 | 天然支持 (无需共享状态) | 需要共享 Redis |
| 吊销能力 | 弱 (需要黑名单) | 强 (直接删除) |
| 存储开销 | 服务端 0 | Redis 存每个会话 |
| 容错 | Redis 挂了仍可用 | Redis 挂了全部失败 |

### nest-search 的选择

```
AT → JWT (无状态)
  理由: 高频验证,不依赖 Redis,性能好

RT → UUID + Redis (有状态)
  理由: 低频操作,需要即时吊销(登出删除)
```

---

## 4. Token 黑名单

### RT 黑名单

```
登出时:
  1. 把 RT 加入黑名单: SET rt_blacklist:{token} "1" EX {ttl}
  2. 删除原 RT: DEL refresh_token:{token}

验证时:
  1. 检查黑名单: GET rt_blacklist:{token}
  2. 存在 → 已吊销 → 拒绝
  3. 不存在 → 有效 → 继续验证

TTL: 等于 RT 剩余有效期,过期后 Redis 自动清理
```

### AT 黑名单 (jti)

```
签发 AT 时:
  1. 生成 jti: randomUUID()
  2. 放入 JWT payload: { sub, username, role, jti }

登出时:
  1. 解码 AT: jwt.decode(token)
  2. 计算剩余 TTL: decoded.exp - now
  3. 加入黑名单: SET at_blacklist:{jti} "1" EX {remainingTtl}

验证时:
  1. 验签名: jwt.verify(token, secret)
  2. 检查黑名单: GET at_blacklist:{jti}
  3. 存在 → 已吊销 → 返回 null
  4. 不存在 → 有效 → 返回 payload

TTL: 等于 AT 剩余有效期,AT 过期后 Redis 自动清理
```

### 为什么用 jti 不用完整 Token?

```
完整 Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyMy... (几百字节)
jti:        a1b2c3d4-e5f6-7890-abcd-ef1234567890    (36 字节)

Redis key: at_blacklist:{jti} 比 at_blacklist:{token} 短得多
节省内存,查询更快
```

---

## 5. Redis 过期清理机制

```
惰性删除: 访问 key 时检查是否过期,过期则删除
定期删除: 每 100ms 随机抽查 20 个有 TTL 的 key,删除过期的

效果: 大部分 key 过期后 ~1s 内被清理
不需要手动清理,不需要 cron job
```

---

## 6. Token Rotation (刷新轮转)

```
POST /api/auth/refresh
  1. 检查旧 RT 是否在黑名单
  2. 从 Redis 拿旧 RT 对应的 userId
  3. 删除旧 RT: DEL refresh_token:{old}
  4. 生成新 AT (jwt.sign)
  5. 生成新 RT (randomUUID) → 存 Redis
  6. 返回新 AT + 新 RT (Cookie)

效果: 每次刷新都换一个 RT,旧 RT 立即失效
防止: 攻击者拿到旧 RT 后继续使用
```

---

## 7. 安全要点

| 要点 | 说明 |
|------|------|
| JWT_SECRET | 至少 16 字符,生产环境用随机长密钥 |
| HTTP-only Cookie | JS 无法读取,防 XSS 窃取 RT |
| sameSite: 'lax' | 防 CSRF 攻击 |
| secure: true | 生产环境强制 HTTPS |
| jti | 唯一标识,支持 AT 即时吊销 |
| 短 AT + 长 RT | AT 泄漏影响窗口小 (2h),RT 有保护 |
