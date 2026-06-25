# nest-search 启动方案

## 项目概览

| 项目 | 内容 |
|------|------|
| 项目名称 | nest-search |
| 技术栈 | NestJS (后端) + TanStack Start (前端) + Docker |
| 包管理器 | pnpm@9.15.0 |
| 架构 | 微服务架构 |

## 基础设施 (Docker)

启动所有依赖服务：

```bash
docker-compose up -d
```

| 服务 | 端口 | 用途 |
|------|------|------|
| MySQL | 3306 | 主数据库 |
| Elasticsearch | 9200 | 搜索服务 |
| BullMQ | 6379, 16379 | 消息队列 |
| Redis | 6379 | 缓存/Session |

## 后端服务 (5个)

```bash
pnpm run start:gateway      # 端口 3000 - API网关
pnpm run start:sync         # 端口 3001 - 同步服务 (HTTP + BullMQ)
pnpm run start:search       # 端口 3002 - 搜索服务
pnpm run start:form         # 端口 3003 - 表单服务
pnpm run start:auth         # 端口 3004 - 认证服务

# 或一键启动全部
pnpm run start:all
```

### 服务依赖关系

```
Gateway (3000)
  ├── Auth Service (3004) - 用户认证/CAS
  ├── Search Service (3002) - Elasticsearch查询
  ├── Form Service (3003) - 表单管理
  └── Sync Service (3001) ← BullMQ
```

## 前端服务 (4个)

分别启动：

```bash
# auth-frontend
cd apps/auth-frontend && pnpm dev
# → http://auth.localhost:3100

# ds-frontend
cd apps/ds-frontend && pnpm dev
# → http://ds.localhost:3101

# zk-frontend
cd apps/zk-frontend && pnpm dev
# → http://zk.localhost:3102

# meeting-frontend
cd apps/meeting-frontend && pnpm dev
# → http://meeting.localhost:3103
```

## 环境变量

确保 `.env` 配置正确：

```bash
# MySQL
DATABASE_URL=mysql://root:root123@localhost:3306/nest_search

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200

# BullMQ
REDIS_URL=amqp://guest:guest@localhost:6379

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
JWT_SECRET=nest-search-jwt-secret-change-in-production
```

## 快速启动脚本

```bash
# 1. 启动基础设施
docker-compose up -d

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm run build

# 4. 启动所有后端服务
pnpm run start:all

# 5. 分别启动各前端 (新终端窗口)
cd apps/auth-frontend && pnpm dev
cd apps/ds-frontend && pnpm dev
cd apps/zk-frontend && pnpm dev
cd apps/meeting-frontend && pnpm dev
```

## 端口汇总

| 服务 | 端口 |
|------|------|
| Gateway | 3000 |
| Sync Service | 3001 |
| Search Service | 3002 |
| Form Service | 3003 |
| Auth Service | 3004 |
| MySQL | 3306 |
| Elasticsearch | 9200 |
| BullMQ | 6379 / 16379 |
| Redis | 6379 |
| auth-frontend | 3100 |
| ds-frontend | 3101 |
| zk-frontend | 3102 |
| meeting-frontend | 3103 |