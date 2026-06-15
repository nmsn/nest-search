import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationShutdown,
} from "@nestjs/common";

@Injectable()
export class LifecycleProbeService
  implements OnModuleDestroy, OnApplicationShutdown
{
  onModuleInit() {
    console.log("[Lifecycle] OnModuleInit: module dependencies resolved");
  }
  onModuleDestroy() {
    console.log("[Lifecycle] OnModuleDestroy: closing connections (simulated)");
  }
  onApplicationShutdown(signal?: string) {
    console.log(
      `[Lifecycle] OnApplicationShutdown: signal=${signal}, flushing logs (simulated)`,
    );
  }
}
