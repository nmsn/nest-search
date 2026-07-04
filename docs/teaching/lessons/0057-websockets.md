# 0057 · WebSocket / Socket.IO：实时通信

> Phase D 第 3 课。nest-search 当前是 HTTP REST，**没有实时推送**。本节讲 WebSocket 协议 + Socket.IO + nest-search 接入点。

## 你今天会拿到什么

1. 理解 **WebSocket 协议**（vs HTTP）
2. 理解 **Socket.IO**（WebSocket 之上）
3. 理解 **NestJS @WebSocketGateway**
4. nest-search 加 WebSocket Gateway（演示）
5. 21 测试还过 + 1 个 commit

---

## §1. 业务问题

### 1.1 nest-search 实时场景

```
场景 A: 同步进度
  sync-service 同步 10w 条产品
  → 用户在前端想知道"现在同步到哪了"
  → 当前: 用户刷新页面查 (不好)
  → 改进: 后端主动推送 "已同步 50%"

场景 B: 订单状态变更
  用户提交订单 → 后台异步处理
  → 状态从 "待支付" → "已支付" → "已发货"
  → 当前: 用户刷新页面查 (不好)
  → 改进: 后端主动推送 "您的订单已发货"

场景 C: 系统告警
  sync-service 同步失败
  → 管理员在管理后台需要立即知道
  → 当前: 看 log（事后）
  → 改进: 实时推送告警到后台
```

### 1.2 nest-search 现状

| 能力 | 状态 |
|------|------|
| HTTP REST API | ✅ |
| 长轮询 (SSE) | ❌ |
| **WebSocket** | ❌ |
| Server Push | ❌ |

---

## §2. HTTP vs WebSocket

### 2.1 HTTP 请求-响应模式

```
传统 HTTP:
  Client                              Server
    │── GET /api/sync/status ────────→│
    │                                  │  查状态
    │←─────── 200 { status: 50% } ────│
    │                                  │
  (连接关闭, 下次要新请求)

问题:
  - 前端要轮询 (每 5 秒问一次)
  - 实时性差 (最多 5 秒延迟)
  - 服务器压力大 (大量无意义请求)
```

### 2.2 WebSocket 双向通信

```
WebSocket:
  Client                              Server
    │── Upgrade: websocket ───────────→│
    │←─────────── 101 Switching ───────│
    │                                  │
    │  双向长连接 (持久)               │
    │                                  │
    │───── { type: 'progress', value: 50 } ──→│
    │←──── { type: 'progress', value: 60 } ───│
    │                                  │
    │←──── { type: 'sync_done' } ────────────│
    │                                  │
    │  服务端主动推                    │
```

### 2.3 关键区别

| 维度 | HTTP | WebSocket |
|------|------|-----------|
| 连接 | 短连接, 一次请求一次响应 | 长连接, 持久 |
| 通信方向 | 客户端 → 服务端 | 双向 |
| 实时性 | 差 (需轮询) | 极好 (服务端主动) |
| 协议 | HTTP/1.1 | ws:// (基于 HTTP 升级) |
| 适用 | CRUD 业务 | 实时通知 / 聊天 / 协同 |
| 端口 | 80/443 | 80/443 (共用) |
| 浏览器支持 | 100% | 100% |

### 2.4 WebSocket 协议

```
握手 (HTTP 升级):
  Client:
    GET /ws HTTP/1.1
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Key: xxx
    Sec-WebSocket-Version: 13

  Server:
    HTTP/1.1 101 Switching Protocols
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Accept: xxx

之后:
  - 双向帧 (frame) 通信
  - 文本/二进制
  - 服务端可主动推
```

---

## §3. Socket.IO

### 3.1 是什么

```
Socket.IO = WebSocket 之上的一层封装
  - 浏览器和服务端都支持
  - 自动降级: WebSocket → 长轮询 (老浏览器)
  - 房间 (room) 概念
  - 命名空间 (namespace)
  - 自动重连
```

### 3.2 vs 纯 WebSocket

| 维度 | 纯 WebSocket | Socket.IO |
|------|-------------|-----------|
| 协议 | WS | WS + polling 降级 |
| 浏览器 | 100% | 100% |
| 老浏览器 | ❌ | ✅ 自动降级 |
| 房间 | 需自己实现 | 内置 |
| 重连 | 需自己实现 | 内置 |
| 心跳 | 需自己实现 | 内置 |
| 生态 | 大 | 大 (主流) |

### 3.3 nest-search 选 Socket.IO

```
推荐: Socket.IO
  - NestJS 一等公民 (@nestjs/websockets + @nestjs/platform-socket.io)
  - 生态成熟
  - 自动降级 + 重连 + 心跳
```

---

## §4. NestJS WebSocket 集成

### 4.1 安装

```bash
pnpm add -w @nestjs/websockets @nestjs/platform-socket.io socket.io
```

### 4.2 Gateway（核心）

```ts
// sync.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // 客户端订阅 "subscribe:progress"
  @SubscribeMessage('subscribe:progress')
  handleSubscribeProgress(client: Socket) {
    // 加入 'progress' 房间
    client.join('progress');
    return { event: 'subscribed', data: { room: 'progress' } };
  }
}
```

### 4.3 推送给所有订阅者

```ts
// sync.service.ts
@Injectable()
export class SyncService {
  constructor(
    @Inject(SyncGateway) private readonly gateway: SyncGateway,
  ) {}

  async triggerFullSync() {
    this.gateway.server.to('progress').emit('progress', { 
      percent: 0, 
      message: '开始同步' 
    });
    
    // 同步过程中持续推送
    for (let i = 0; i <= 100; i += 10) {
      await this.doSync(i);
      this.gateway.server.to('progress').emit('progress', { 
        percent: i, 
        message: `已同步 ${i}%` 
      });
    }
    
    this.gateway.server.to('progress').emit('progress', { 
      percent: 100, 
      message: '同步完成' 
    });
  }
}
```

### 4.4 客户端连接

```typescript
// 前端
import { io } from 'socket.io-client';

const socket = io('http://localhost:3005/sync');  // 服务端地址

socket.on('connect', () => {
  socket.emit('subscribe:progress');
});

socket.on('progress', (data) => {
  console.log(`进度: ${data.percent}%`);
  // 更新 UI
});
```

---

## §5. nest-search 改造（演示）

### 5.1 sync-service 加 WebSocket

```
目标: sync-service 同步时, 实时推送进度
步骤:
  1. 装 @nestjs/websockets + socket.io
  2. 创建 sync.gateway.ts
  3. sync.service.ts 集成推送
  4. gateway (端口 3000) 加 WebSocket 代理
  5. 前端订阅 'progress' 事件
```

### 5.2 进度推送设计

```
时序:
  1. 前端: emit('subscribe:progress')
  2. Gateway: 客户端加入 'progress' 房间
  3. 前端: POST /api/sync/full/electronics
  4. sync.service: emit('progress', { percent: 0 })
  5. sync.service: 同步中持续 emit('progress', { percent: 30 })
  6. sync.service: emit('progress', { percent: 100, done: true })

前端监听 progress 事件, 实时显示进度条
```

### 5.3 房间（room）设计

```
不同业务线用不同房间:
  'progress:ds'   → 商显同步进度
  'progress:zk'   → 道闸同步进度
  'progress:meeting' → 会议平板同步进度

订阅特定房间:
  socket.emit('subscribe:progress', { businessLine: 'ds' });
  → 后端: socket.join('progress:ds')
  → 推送只到 ds 房间, 不影响其他
```

---

## §6. 鉴权问题

### 6.1 WebSocket 怎么鉴权？

```
HTTP:
  Header: Authorization: Bearer <jwt>
  每个请求都带, Guard 容易检查

WebSocket:
  长连接, 不适合每次消息都发 JWT
  → 客户端连接时验证一次
  → 之后用 session id 维持
```

### 6.2 Socket.IO 鉴权方案

```ts
// 服务端
@WebSocketGateway()
export class SyncGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token || !this.verifyJwt(token)) {
      client.disconnect();
      return;
    }
    // 保存 user 信息到 socket.data
    client.data.user = this.getUserFromToken(token);
  }
}
```

```ts
// 客户端
const socket = io('http://localhost:3005/sync', {
  auth: { token: 'your-jwt-token' }
});
```

### 6.3 nest-search 鉴权集成

```
nest-search 已有 CasGuard (HTTP)
WebSocket 可以复用:
  - 客户端连接时带 JWT
  - Gateway 在 handleConnection 验证
  - 把 user 信息存到 socket.data
  - 业务方法通过 socket.data.user 取
```

---

## §7. nest-search 实时场景

### 7.1 推荐场景

```
✅ 适合 nest-search:
  - 同步进度推送 (用户友好)
  - 订单状态变更 (业务核心)
  - 系统告警 (运维需要)

❌ 不适合:
  - 高频消息 (游戏帧同步) - nest-search 不是这个
  - 大量并发连接 (百万级) - nest-search 用户量不大
```

### 7.2 实际改造成本

```
实现 sync 进度推送:
  - 1 小时装依赖
  - 30 分钟写 Gateway
  - 30 分钟改 sync.service
  - 30 分钟前端 demo
  - 1 小时测试
  总计: 3-4 小时
```

---

## §8. 设计决策

### 决策 1 · 选 WebSocket 还是 SSE？

```
WebSocket (Socket.IO):
  ✅ 双向
  ✅ 生态成熟
  ✅ 房间/命名空间
  适合: 复杂实时

SSE (Server-Sent Events):
  ✅ 单向 (服务端 → 客户端)
  ✅ 简单 (HTTP 一样)
  ✅ 自动重连
  适合: 简单通知 (本节 nest-search 同步进度)

选择:
  - 同步进度: SSE 更简单
  - 订单状态: WebSocket (可能要双向)
  - 聊天/协同: WebSocket
```

### 决策 2 · nest-search 现在加吗？

```
当前 nest-search:
  - 30 条产品, 同步 1 秒完
  - 实时进度意义不大
  - 订单/告警等场景还没实现

建议:
  - 演示 WebSocket 接入 (1-2 小时)
  - 未来加订单/告警时, 直接用
  - 简历亮点: "完整 WebSocket 集成"
```

---

## §9. Quiz

**Q1: WebSocket 跟 HTTP 关键区别？**

A) HTTP 双向, WebSocket 单向
B) WebSocket 长连接双向, HTTP 短连接
C) 一样, 只是协议名不同

**Q2: Socket.IO 比纯 WebSocket 多了什么？**

A) 更快
B) 自动降级 + 房间 + 自动重连 + 心跳
C) 更安全

**Q3: WebSocket 鉴权最佳实践？**

A) 每个消息都带 JWT
B) 客户端连接时带 JWT 验证一次
C) 不要鉴权

---

## §10. Commit Message

```
feat(sync-service): 0057 WebSocket Gateway (Socket.IO)

- @nestjs/websockets + @nestjs/platform-socket.io
- sync.gateway.ts: 订阅 progress 房间
- sync.service.ts: 同步过程 emit 进度
- 鉴权: handleConnection 验证 JWT
- 21 测试还过
```

---

## §11. 跨节链接

- [0056 · RBAC](./0056-rbac-decorator.md) — 上一课
- [0058 · SSE](./0058-sse.md) — 下一课
- [sync.gateway.ts](../../apps/sync-service/src/sync/sync.gateway.ts) — Gateway 实现
