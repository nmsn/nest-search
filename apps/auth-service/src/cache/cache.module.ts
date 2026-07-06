import { Global, Module } from "@nestjs/common";
import { CacheService } from "./cache.service";

/**
 * 通用缓存 module — 全局导出,业务方直接注入 CacheService 即可
 *
 * 为什么 @Global:
 *   - 跟 RedisModule / DrizzleModule 一致,基础设施级服务全局可见
 *   - 避免每个 feature module 都 imports: [CacheModule]
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
