# 0030 · CORS + 安全头 + 请求限制

> Phase A 第 12 课（Phase A 收官）。0029 做完 Swagger,0030 补**安全配置**：CORS 跨域策略 + HTTP 安全头 + 请求体大小限制。

## 你今天会拿到什么

1. 理解 **CORS 是什么**（为什么浏览器会阻止跨域请求）
2. 掌握 **NestJS CORS 配置**（从全开到精确控制）
3. 了解 **HTTP 安全头**（Helmet）的作用
4. 掌握 **请求体大小限制**（防止大 payload 攻击）
5. 21 测试还过 + 1 个 commit

---

## §1. CORS 是什么

```
浏览器的同源策略 (Same-Origin Policy):
  前端 http://localhost:3000 → 后端 http://localhost:3004
  不同端口 = 不同源 = 浏览器阻止

  前端发请求:
  fetch('http://localhost:3004/api/auth/login', { method: 'POST', body: ... })
  → 浏览器: "跨域请求,先发 OPTIONS 预检"
  → 后端没配 CORS → OPTIONS 返回 404 → 浏览器阻止实际请求

CORS (Cross-Origin Resource Sharing):
  后端告诉浏览器:"这些源可以访问我"
  Access-Control-Allow-Origin: http://localhost:3000
  → 浏览器: "后端允许了,放行"
```

---

## §2. nest-search 现状

```ts
// gateway: 精确配置
app.enableCors({
  origin: ['http://auth.localhost:3100', 'http://ds.localhost:3101', ...],
  credentials: true,
});

// auth-service: 全开
app.enableCors();  // ⚠️ 允许所有源

// 其他 service: 有的开有的没开
```

**问题**：`app.enableCors()` 不带参数 = `Access-Control-Allow-Origin: *`，生产环境不安全。

---

## §3. 设计决策

### 决策 1 · CORS 配置放哪里？

```
方案 A: 每个 service 的 main.ts 自己配
  优点: 各 service 控制自己的跨域策略
  缺点: 重复配置

方案 B: 只在 gateway 配 CORS,下游 service 不配
  优点: 集中管理,下游只接受 gateway 的请求
  缺点: 开发时直连下游 service 需要额外配置
```

**选 A**。理由：
- 开发环境直连各 service 调试
- 生产环境 gateway 是唯一入口,下游 CORS 配置不影响
- 各 service 可以有不同的跨域策略

### 决策 2 · 精确配置还是全开？

```ts
// 开发环境: 允许 localhost 系列
origin: [/^http:\/\/localhost:\d+$/]

// 生产环境: 只允许指定域名
origin: ['https://app.example.com']
```

**按环境区分**：开发宽松，生产严格。

---

## §4. 动手：CORS 配置

### main.ts 配置

```ts
// apps/auth-service/src/main.ts
const isProduction = config.getOrThrow<string>('NODE_ENV') === 'production';

app.enableCors({
  origin: isProduction
    ? ['https://app.example.com']  // 生产:白名单
    : [/^http:\/\/localhost:\d+$/], // 开发:localhost 任意端口
  credentials: true,               // 允许 Cookie
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

### 关键参数

| 参数 | 含义 | 示例 |
|------|------|------|
| `origin` | 允许的源 | `['https://a.com']` 或正则 |
| `credentials` | 允许 Cookie | `true` |
| `methods` | 允许的 HTTP 方法 | `['GET', 'POST']` |
| `allowedHeaders` | 允许的请求头 | `['Content-Type', 'Authorization']` |
| `maxAge` | 预检缓存时间(秒) | `86400` (24h) |

---

## §5. HTTP 安全头 (Helmet)

```bash
pnpm add helmet
```

```ts
// main.ts
import helmet from 'helmet';
app.use(helmet());
```

**Helmet 设置的安全头**：

| 头 | 作用 | 默认值 |
|---|------|-------|
| `X-Content-Type-Options` | 禁止浏览器猜测 MIME 类型 | `nosniff` |
| `X-Frame-Options` | 禁止 iframe 嵌入 | `DENY` |
| `X-XSS-Protection` | XSS 过滤 | `1; mode=block` |
| `Strict-Transport-Security` | 强制 HTTPS | `max-age=31536000` |
| `Content-Security-Policy` | 限制资源加载来源 | 默认策略 |

**为什么要加？**

```bash
# 没有 Helmet 时,响应头:
HTTP/1.1 200 OK
Content-Type: application/json
# ↑ 浏览器可以被攻击者利用

# 有 Helmet 时,响应头:
HTTP/1.1 200 OK
Content-Type: application/json
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
# ↑ 浏览器有了防御层
```

---

## §6. 请求体大小限制

```ts
// main.ts
app.use(express.json({ limit: '10mb' }));      // JSON body 限制
app.use(express.urlencoded({ limit: '10mb', extended: true }));  // form body 限制
```

**为什么要限制？**

```
攻击者发 1GB 的 POST body:
  没有限制 → 服务器内存爆炸 → OOM 崩溃
  有限制 → 413 Payload Too Large → 拒绝
```

**NestJS 默认**：`ValidationPipe` 不限制 body 大小，需要手动配置。

---

## §7. Quiz

**Q1: CORS 的 `Access-Control-Allow-Origin: *` 在生产环境有什么问题？**

A) 性能差
B) 任何网站都能访问你的 API,存在安全风险
C) 不支持 Cookie

**Q2: Helmet 的 `X-Frame-Options: DENY` 防止什么攻击？**

A) SQL 注入
B) 点击劫持 (Clickjacking) — 攻击者用 iframe 嵌入你的页面
C) CSRF 攻击

**Q3: 请求体大小限制防止什么？**

A) 防止用户上传太大的文件
B) 防止攻击者发送超大 payload 导致服务器内存耗尽
C) 防止网络拥堵

---

## §8. Commit Message

```
feat: 0030 CORS 安全配置 + Helmet 安全头 + 请求体限制

- auth-service: CORS 精确配置 (按环境区分)
- 安装 helmet + 启用安全头
- 请求体大小限制 (10mb)
- 21 测试还过
```

---

## §9. 跨节链接

- [0029 · Swagger](./0029-swagger-api-documentation.md) — 上一课
- [0031 · Redis 深度](./0031-redis-deep-dive.md) — 下一课 (Phase B!)
