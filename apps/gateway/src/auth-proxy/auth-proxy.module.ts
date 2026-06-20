import { Module } from '@nestjs/common';
import { AuthProxyController } from './auth-proxy.controller';

@Module({
  controllers: [AuthProxyController], // 5 个 routes 自动暴露
  // providers: []                  ← ProxyService 是 @Global,自动可见
})
export class AuthProxyModule {}