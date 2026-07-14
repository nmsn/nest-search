import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAuthClient, type AuthTrpcClient } from './auth.client';

/**
 * Gateway 的 tRPC client module
 *
 * 提供 4 个 backend service 的 typed tRPC client(singleton)
 *   - authClient:   gateway → auth-service
 *   - searchClient: (0069.4 加)
 *   - formClient:   (0069.4 加)
 *   - syncClient:   (0069.4 加)
 *
 * 本次 commit 只实现 authClient(search/form/sync 后续)
 */
@Global()
@Module({
  providers: [
    {
      provide: 'AUTH_TRPC_CLIENT',
      useFactory: (config: ConfigService): AuthTrpcClient =>
        createAuthClient(config),
      inject: [ConfigService],
    },
  ],
  exports: ['AUTH_TRPC_CLIENT'],
})
export class TrpcClientModule {}
