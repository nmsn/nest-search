import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { Public } from "../common/decorators";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  // liveness: 进程在就行
  @Public()
  @Get("live")
  @HealthCheck()
  liveness() {
    return this.health.check([
      (mem) => mem.checkHeap("memory_heap", 300 * 1024 * 1024),
    ]);
  }

  // readiness: 进程在 + 下游能调到
  @Public()
  @Get()
  @HealthCheck()
  readiness() {
    return this.health.check([
      (http) =>
        http.pingCheck("auth-service", "http://localhost:3004", {
          // 接受 2xx / 3xx / 4xx 都算"活着",只有 5xx 才算挂了
          validateStatus: (status) => status >= 200 && status < 500,
        }),
      (mem) => mem.checkHeap("memory_heap", 200 * 1024 * 1024),
    ]);
  }
}
