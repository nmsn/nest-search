import { Injectable, NestMiddleware, Logger } from '@nestjs/common';

/**
 * 慢查询监控中间件（演示用）
 *
 * 记录所有 /api/search/* 请求的耗时
 * 超过 200ms 标记为 warn
 * 生产环境推荐用 ES 自带的 slowlog（更准确，无侵入）
 */
@Injectable()
export class SlowQueryMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SlowQueryMiddleware.name);
  private readonly SLOW_THRESHOLD_MS = 200;

  use(req: any, res: any, next: () => void) {
    const start = Date.now();

    // 拦截 res.json 拿到底层 ES took 时间
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const duration = Date.now() - start;
      const esTook = body?.took;
      const total = body?.hits?.total?.value;

      if (duration > this.SLOW_THRESHOLD_MS) {
        this.logger.warn(
          `[SlowQuery] ${duration}ms (es took=${esTook}ms, total=${total}, url=${req.url})`,
        );
      } else {
        this.logger.log(
          `[Query] ${duration}ms (es took=${esTook}ms, total=${total})`,
        );
      }
      return originalJson(body);
    };

    next();
  }
}
