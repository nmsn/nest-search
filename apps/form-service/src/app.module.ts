import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { DrizzleModule } from './database/drizzle.module';
import { SchemeModule } from './scheme/scheme.module';
import { FormModule } from './form/form.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ← 0017: 对齐 gateway 0005 / search-service 0016 模式
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
        autoLogging: false,
      },
    }),
    DrizzleModule,
    SchemeModule,
    FormModule,
  ],
})
export class AppModule {}
