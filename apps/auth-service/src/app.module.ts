import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { DrizzleModule } from "./database/drizzle.module";
import { UserModule } from "./user/user.module";
import { CasModule } from "./cas/cas.module";
import { AuthModule } from "./auth/auth.module";
import { RedisModule } from "./redis/redis.module";
import { validateEnv } from "./config/validate-env";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // 跨服务追踪:接受 gateway 传来的 x-request-id 头
    // 用 forRootAsync 注入 ConfigService,避免 module metadata 时 process.env 直读
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>("LOG_LEVEL"),
          genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
          customProps: (req) => ({ requestId: req.id }),
          autoLogging: true,
        },
      }),
    }),
    DrizzleModule,
    RedisModule,
    UserModule,
    CasModule,
    AuthModule,
  ],
})
export class AppModule {}
