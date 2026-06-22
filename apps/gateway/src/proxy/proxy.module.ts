import { Global, Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { HttpClientModule } from '../common/http-client/http-client.module';

@Global() // 全 app 可见,feature module 不用再 import
@Module({
  imports: [HttpClientModule], // ← 必须 import HttpClientModule,否则 ProxyService 拿不到 HttpClientService
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}