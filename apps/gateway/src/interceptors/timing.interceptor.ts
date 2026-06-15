import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

@Injectable()
export class TimingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(TimingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const start = performance.now();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // 用 res.on('finish') 替代 finalize: 响应真的发完了才 log,statusCode 一定准
    res.on("finish", () => {
      const durationMs = Number((performance.now() - start).toFixed(2));
      this.logger.info(
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          durationMs,
        },
        "request completed",
      );
    });

    return next.handle();
  }
}
