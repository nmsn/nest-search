import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { AppController } from "./app.controller";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { CasGuard } from "./guards/cas.guard";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { ProxyService } from "./proxy/proxy.service";
import { LifecycleProbeService } from "./lifecycle/lifecycle-probe.service";
import { TimingInterceptor } from "./interceptors/timing.interceptor";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || "info",
        genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
        autoLogging: false,
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    ProxyService,
    LifecycleProbeService, // ← 新加
    {
      provide: APP_INTERCEPTOR,
      useClass: TimingInterceptor, // ← 全局注册
    },
    {
      provide: APP_GUARD,
      useClass: CasGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
