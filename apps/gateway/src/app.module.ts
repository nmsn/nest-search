import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { HealthModule } from "./health/health.module";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { HttpClientModule } from "./common/http-client/http-client.module";
import { RolesGuard } from "./guards/roles.guard";
import { ProxyModule } from "./proxy/proxy.module";
import { AuthProxyModule } from "./auth-proxy/auth-proxy.module";
import { validateEnv } from "./config/validate-env";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    HttpClientModule, // ← 新加,放最前(其他 module 都依赖)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>("LOG_LEVEL"),
          genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
          customProps: (req) => ({ requestId: req.id }),
          autoLogging: false,
        },
      }),
    }),
    HealthModule, // ← 新加
    ThrottlerModule.forRoot([
      // ← 新加
      { name: "short", ttl: 1_000, limit: 5 },
      { name: "long", ttl: 60_000, limit: 100 },
    ]),
    ProxyModule, // ← 0012 新加,@Global,export ProxyService
    AuthProxyModule, // ← 0012 新拆,/api/auth/* 5 个 routes
  ],
  controllers: [AppController],
  providers: [
    // ProxyService 已搬到 ProxyModule(由 ProxyModule @Global 导出)
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // ← 新加,全局生效
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
