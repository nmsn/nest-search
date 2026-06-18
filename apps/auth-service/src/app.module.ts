import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { DrizzleModule } from './database/drizzle.module';
import { UserModule } from './user/user.module';
import { CasModule } from './cas/cas.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 跨服务追踪:接受 gateway 传来的 x-request-id 头
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
        autoLogging: true,  // 打开自动 request 日志,带 requestId,方便调试
      },
    }),
    DrizzleModule,
    RedisModule,
    UserModule,
    CasModule,
    AuthModule,
  ],
})
export class AppModule {}
