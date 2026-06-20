import { Global, Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Global() // 全 app 可见,feature module 不用再 import
@Module({
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}