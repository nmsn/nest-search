import { Module } from '@nestjs/common';
import { TRPCModule } from 'nestjs-trpc';
import { AuthContext } from './auth.context';
import { AuthRouter } from './auth.router';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Auth Service 的 tRPC module
 *
 * 路由:POST/GET /trpc/auth.*
 * 来源:libs/shared/src/contracts/auth.contract.ts(共享 contract)
 *
 * 注意:UserModule / AuthModule 必须 import,因为 AuthRouter 依赖它们的 service
 */
@Module({
  imports: [
    TRPCModule.forRoot({
      basePath: '/trpc',
      context: AuthContext,
    }),
    UserModule,
    AuthModule,
  ],
  controllers: [AuthRouter],
})
export class AuthTrpcModule {}
