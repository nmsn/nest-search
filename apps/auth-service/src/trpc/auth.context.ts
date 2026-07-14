import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../../../../libs/shared/src';
import { TRPCContext } from 'nestjs-trpc';

/**
 * Auth-service 的 tRPC context 类
 *
 * NestJS 注入到 TRPCModule.forRoot({ context: AuthContext })
 * 每次请求时调用 .create(opts) 创建 context
 */
@Injectable()
export class AuthContext implements TRPCContext {
  private readonly jwtSecret: string;

  constructor(config: ConfigService) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
  }

  /**
   * nestjs-trpc 调用的 context 创建方法
   * 接收 NestJS 的 express request
   */
  create({ req }: { req: any }) {
    const requestId = (req.headers['x-request-id'] as string) || '';
    const auth = req.headers['authorization'] as string | undefined;
    let user: JwtPayload | null = null;

    if (auth?.startsWith('Bearer ')) {
      try {
        user = jwt.verify(
          auth.slice(7),
          this.jwtSecret,
        ) as unknown as JwtPayload;
      } catch {
        // token 无效 → user = null,procedure 自己判断要不要 throw
        user = null;
      }
    }

    return { requestId, user };
  }
}
