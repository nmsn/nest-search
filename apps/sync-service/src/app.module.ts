import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { SyncModule } from './sync/sync.module';
import { validateEnv } from './config/validate-env';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // ← 0017: 对齐 gateway 0005 / search-service 0016 模式
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
          customProps: (req) => ({ requestId: req.id }),
          autoLogging: false,
        },
      }),
    }),
    SyncModule,
  ],
})
export class AppModule {}
