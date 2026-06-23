# nest-search 配置总览

> 所有 5 个 service 用 env 变量。Zod 校验在启动时检查(0019+0020 装)。
> 失败:服务不启动,log 告诉你哪个字段错了。

## 字段总表

| 字段 | 类型 | 默认 | 用在 | 说明 |
|---|---|---|---|---|
| `NODE_ENV` | enum | development | all 5 | dev / test / production |
| `LOG_LEVEL` | enum | info | all 5 | error / warn / info / debug |
| `JWT_SECRET` | string(≥16) | (无默认,必须设) | gateway/auth/search/sync/form | JWT 签名密钥,生产必须改 |
| ... | ... | ... | ... | ... |

## 共享字段 vs 私有字段

### 共享字段(所有 service 都有)

NODE_ENV / LOG_LEVEL / JWT_SECRET / JWT_EXPIRES_IN /
CAS_COOKIE_DOMAIN / CAS_TGT_EXPIRES_IN / CAS_ST_EXPIRES_IN

### 私有字段

每个 service 自己的端口 / 业务字段,见各 service 的 `.env.example`。

## 安全约定

- JWT_SECRET 生产必须用 `openssl rand -hex 32` 生成,**绝对不能**用默认占位符
- DATABASE_URL 含密码,生产用 secret manager(vault / k8s secret / etc.)
- RABBITMQ_URL 含密码,同上

## 新成员 onboarding 步骤

1. cp apps/gateway/.env.example apps/gateway/.env
2. cp apps/auth-service/.env.example apps/auth-service/.env
3. ... (5 个都 cp)
4. 编辑 .env,改 JWT_SECRET 为自己生成的(其他可以保留默认)
5. pnpm docker:up
6. pnpm test
7. pnpm start:all