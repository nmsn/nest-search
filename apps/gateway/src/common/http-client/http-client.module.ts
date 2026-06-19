import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HttpClientService } from './http-client.service';

@Module({
  imports: [HttpModule], // ← HttpModule 是 @nestjs/axios 的 module
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {}