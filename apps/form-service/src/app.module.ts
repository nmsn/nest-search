import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { DrizzleModule } from './database/drizzle.module';
import { SchemeModule } from './scheme/scheme.module';
import { FormModule } from './form/form.module';
import { validateEnv } from './config/validate-env';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

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
    DrizzleModule,
    SchemeModule,
    FormModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
