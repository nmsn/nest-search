import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationShutdown,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

@Injectable()
export class LifecycleProbeService
  implements OnModuleDestroy, OnApplicationShutdown
{
  constructor(
    @InjectPinoLogger(LifecycleProbeService.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.logger.info("module dependencies resolved");
  }
  onModuleDestroy() {
    this.logger.info("closing connections (simulated)");
  }
  onApplicationShutdown(signal?: string) {
    this.logger.info({ signal }, "flushing logs (simulated)");
  }
}
