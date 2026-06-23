import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { SyncModule } from './sync/sync.module';
import { validateEnv } from './config/validate-env';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // ← 0017: 对齐 gateway 0005 / search-service 0016 模式
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
        autoLogging: false,
      },
    }),
    SyncModule,
  ],
})
export class AppModule {}
