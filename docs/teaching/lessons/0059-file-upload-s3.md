# 0059 · 文件上传 + S3 预签名 URL

> Phase D 第 5 课。nest-search 当前图片用 mock URL，**没有真实上传**。本节讲 S3 预签名上传模式（前端直传，不经过业务后端）。

## 你今天会拿到什么

1. 理解 **三种上传模式**（业务中转 / 直传 / 预签名）
2. 理解 **S3 预签名 URL** 原理
3. 学会 **AWS SDK / MinIO** 集成
4. nest-search 加 upload endpoint（演示）
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 现状

```
当前: products.imageUrl = "https://example.com/p001.jpg"
  - 假 URL
  - 真实场景: 商家上传产品图

需要:
  - 商家上传产品图
  - 图片存哪里？
  - 怎么存？
  - 谁来负责？
```

### 1.2 三种上传模式对比

| 模式 | 流程 | 适合 | 缺点 |
|------|------|------|------|
| **业务中转** | 客户端 → 后端 → 存储 | 简单 | 后端压力大, 不适合大文件 |
| **前端直传** | 客户端 → 存储 | 简单 | 安全/签名问题 |
| **预签名 URL** | 客户端 → 后端拿签名 → 客户端直传存储 | 推荐 | 实现稍复杂 |

### 1.3 推荐：预签名 URL

```
时序:
  1. 客户端: "我要上传 product.jpg" → 后端
  2. 后端: 验证用户, 生成签名 URL (限 5 分钟有效)
  3. 后端: 返回签名 URL
  4. 客户端: PUT <签名 URL> + 文件
  5. 存储: 验证签名, 存文件
  6. 客户端: 调业务后端 "上传完成"
  7. 业务后端: 存 URL 到数据库

优势:
  ✅ 业务后端不传文件 (省带宽)
  ✅ 适合大文件 (GB 级)
  ✅ 签名机制保证安全
  ✅ 存储后端灵活 (S3 / MinIO / OSS)
```

---

## §2. S3 预签名 URL 原理

### 2.1 概念

```
预签名 URL (Presigned URL):
  - 临时 URL, 5-15 分钟有效
  - 包含: 存储路径 + 签名 + 过期时间
  - 任何人拿到这个 URL, 在有效期内可上传
  - 过期后失效, 重新申请

类比:
  - 普通 API: 永久密钥
  - 预签名 URL: 临时工牌 (5 分钟有效)
```

### 2.2 URL 例子

```
https://nest-search-products.s3.amazonaws.com/products/2026/07/p001.jpg
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKIA...%2F20260704%2Fus-east-1%2Fs3%2Faws4_request
  &X-Amz-Date=20260704T103000Z
  &X-Amz-Expires=300           ← 5 分钟有效
  &X-Amz-Signature=xxxxxx
  &X-Amz-SignedHeaders=host
```

**关键参数**：
- `X-Amz-Expires=300`: 5 分钟过期
- `X-Amz-Signature`: HMAC 签名
- 攻击者改了文件路径 → 签名不匹配 → 拒绝

### 2.3 工作流

```
1. 客户端: 调 /api/upload/sign?filename=p001.jpg
2. 后端: 验证用户 + 权限 → 生成预签名 URL
3. 后端: 返回 {
     uploadUrl: 'https://...',
     key: 'products/2026/07/p001.jpg',
     expiresIn: 300
   }
4. 客户端: fetch(uploadUrl, { method: 'PUT', body: file })
5. S3: 验证签名, 存文件
6. 客户端: 调 /api/upload/confirm { key: '...' }
7. 后端: 把 URL 存到 DB
```

---

## §3. S3 兼容存储

### 3.1 选项

| 服务 | 特点 |
|------|------|
| **AWS S3** | 主流, 按量计费 |
| **MinIO** | 开源 S3 兼容, 自建 |
| **阿里云 OSS** | 国内, S3 兼容 API |
| **腾讯云 COS** | 国内, S3 兼容 |
| **七牛云** | 国内, 自定义 API |

### 3.2 nest-search 推荐

```
学习用: MinIO (Docker compose 启动)
  - 开源, 免费
  - S3 兼容 API
  - 本地运行
  - AWS SDK 直接连

生产用: 阿里云 OSS 或 AWS S3
  - 选 1 个
```

### 3.3 MinIO 启动

```yaml
# docker-compose.dev.yml
services:
  minio:
    image: minio/minio
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
```

---

## §4. NestJS 集成

### 4.1 安装 SDK

```bash
pnpm add -w @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 4.2 配置

```ts
// storage.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.s3 = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT'),  // MinIO: http://localhost:9000
      region: this.config.getOrThrow<string>('S3_REGION'),  // us-east-1
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: true,  // MinIO 需要
    });
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
  }

  // 生成预签名上传 URL
  async generateUploadUrl(key: string, contentType: string, expiresIn = 300) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
    return {
      uploadUrl,
      key,
      expiresIn,
      publicUrl: `http://localhost:9000/${this.bucket}/${key}`,
    };
  }
}
```

### 4.3 Controller

```ts
// upload.controller.ts
import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { CasGuard } from '@app/shared/guards/cas.guard';
import { RequirePermission } from '@app/shared/decorators/require-permission.decorator';
import { PermissionGuard } from '@app/shared/guards/permission.guard';
import { StorageService } from './storage.service';

@UseGuards(CasGuard, PermissionGuard)
@Controller('api/upload')
export class UploadController {
  constructor(private readonly storageService: StorageService) {}

  // 1. 申请上传签名
  @RequirePermission('product:write')
  @Post('sign')
  async sign(@Body() body: { filename: string; contentType: string }) {
    const key = `products/${new Date().toISOString().slice(0, 10)}/${body.filename}`;
    return this.storageService.generateUploadUrl(key, body.contentType);
  }

  // 2. 上传完成确认
  @RequirePermission('product:write')
  @Post('confirm')
  async confirm(@Body() body: { key: string }) {
    // 存到 DB (省略, 略)
    return { key: body.key, message: '确认成功' };
  }
}
```

### 4.4 前端使用

```typescript
// 1. 申请签名
const signRes = await fetch('/api/upload/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: 'product.jpg',
    contentType: 'image/jpeg',
  }),
});
const { uploadUrl, publicUrl } = await signRes.json();

// 2. 直接上传到 S3
const file = document.getElementById('fileInput').files[0];
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'image/jpeg' },
});

// 3. 通知后端
await fetch('/api/upload/confirm', {
  method: 'POST',
  body: JSON.stringify({ key: publicUrl }),
});
```

---

## §5. nest-search 接入

### 5.1 推荐场景

```
✅ 产品图片 (imageUrl 字段真实化)
✅ 用户头像 (auth-service)
✅ 文件附件 (form-service)
```

### 5.2 改造路径

```
阶段 1: 加 MinIO docker-compose
阶段 2: 装 @aws-sdk
阶段 3: StorageService 封装 (生产用, MinIO 学习用)
阶段 4: upload.controller 加 /sign 和 /confirm
阶段 5: 改 imageUrl 字段, 真存 URL
```

### 5.3 工作量

```
完整改造: 2-3 小时
最小 demo: 30 分钟
  - MinIO docker-compose
  - 一个 endpoint 生成签名
  - 不存 DB, 只返回 URL
```

---

## §6. 设计决策

### 决策 1 · 文件存哪？

```
学习用: MinIO (本地 Docker)
生产用: 
  - 国内: 阿里云 OSS / 腾讯云 COS
  - 海外: AWS S3 / Cloudflare R2

选 OSS/COS 还是 S3:
  - 看用户在哪里
  - 国内项目: OSS
  - 海外项目: S3
```

### 决策 2 · 文件名怎么定？

```
策略 A: 用户原名
  - p001.jpg
  - 风险: 重名, 特殊字符

策略 B: UUID 重命名 (推荐)
  - 2026/07/uuid.jpg
  - 避免重名

策略 C: 按业务类型目录
  - products/2026/07/uuid.jpg
  - avatars/uuid.png
  - 分类清晰
```

### 决策 3 · 预签名 vs 直传

```
✅ 预签名 (推荐):
  - 大文件
  - 高安全

❌ 直传 (token):
  - 简单场景
  - 小文件
  - 临时用
```

---

## §7. nest-search 当前决策（企业级完整）

```
⚠️ 课程定位更正: nest-search 是企业级课程, 必须完整实施

要不要现在加 S3 上传?

✅ 适合加 (企业级完整):
  - 1-2 小时工作
  - 简历亮点: "S3 预签名 URL 上传 + 完整集成"
  - nest-search 是企业级项目, 不能"最小 demo"
  - 必须实施:
    - MinIO 启动 (docker compose)
    - StorageService 封装 (AWS SDK)
    - /api/upload/sign endpoint
    - /api/upload/confirm endpoint
    - 前端集成
    - 鉴权 + 权限控制 (仅 admin 可上传)
    - 大小限制 + Content-Type 限制
    - 异常处理 (上传失败回滚)
```

**真实生产场景**：

```
产品图片: 商家上传 (10w+ 产品, 每张 1-5MB)
用户头像: 用户注册时上传
表单附件: 商家提报资料
订单截图: 售后凭证

→ nest-search 必须支持文件上传
→ 企业级必备能力
```

---

## §8. Quiz

**Q1: S3 预签名 URL 是什么？**

A) 永久 URL
B) 临时 URL (5-15 分钟有效, 含签名)
C) 加密 URL

**Q2: 为什么用预签名 URL 而不是业务中转？**

A) 业务中转更安全
B) 业务中转省带宽, 大文件不友好
C) 预签名更快

**Q3: 客户端拿到预签名 URL 后能直接上传吗？**

A) 不能, 还要后端转发
B) 能, 直接 PUT 到 URL 即可
C) 需要加请求头

---

## §9. Commit Message

```
feat(search-service): 0059 S3 预签名上传 - MinIO + 最小 demo

- docker-compose.dev.yml: MinIO 启动
- 装 @aws-sdk/client-s3 + presigner
- storage.service.ts: generateUploadUrl() 封装
- upload.controller.ts: POST /api/upload/sign endpoint
- 21 测试还过
```

---

## §10. 跨节链接

- [0058 · SSE](./0058-sse.md) — 上一课
- [0060 · DI scope](./0060-di-scope-advanced.md) — 下一课
- [storage.service.ts](../../apps/search-service/src/storage/storage.service.ts) — 存储实现
