import { ConfigService } from '@nestjs/config';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../../libs/shared/src/contracts';

/**
 * Auth tRPC client wrapper(gateway → auth-service)
 *
 * 设计:
 *   - createAuthClient() 工厂方法接收 ConfigService,返回 singleton client
 *   - 每个 mutate/query 调用通过 withHeaders() 包装,自动附加:
 *     - authorization: 从 express req 拿,转给 auth-service
 *     - x-request-id:   保持日志链路追踪不断
 *
 * 端到端类型安全:
 *   - import AppRouter 类型(从 libs/shared/src/contracts/auth.contract.ts)
 *   - 改 contract 上 procedure 的 input/output → await 调用 TS 编译报错
 *
 * 用法:
 *   const client = createAuthClient(config);
 *   const result = await client.auth.login.mutate(
 *     { username, password },
 *     { context: { headers: { authorization, 'x-request-id': reqId } } }
 *   );
 */
export function createAuthClient(config: ConfigService) {
  const authUrl = config.getOrThrow<string>('AUTH_SERVICE_URL');

  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${authUrl}/trpc`,
      }),
    ],
  });
}

/**
 * 类型导出,方便调用方
 */
export type AuthTrpcClient = ReturnType<typeof createAuthClient>;
