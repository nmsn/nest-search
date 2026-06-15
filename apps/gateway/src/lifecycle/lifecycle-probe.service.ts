import { Injectable, OnModuleDestroy, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class LifecycleProbeService implements OnModuleDestroy, OnApplicationShutdown {
  onModuleDestroy() {
    console.log('[Lifecycle] OnModuleDestroy: closing connections (simulated)');
  }
  onApplicationShutdown(signal?: string) {
    console.log(`[Lifecycle] OnApplicationShutdown: signal=${signal}, flushing logs (simulated)`);
  }
}