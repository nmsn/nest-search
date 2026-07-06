import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

/**
 * 通用 Cache-Aside 封装 — nest-search 业务方一行调用,自动处理 3 大坑
 *
 * - 穿透:fetcher 返回 null/undefined 时缓存空值
 * - 雪崩:TTL 加 ±30s 随机抖动
 * - 击穿:enableLock=true 时走 Redis SET NX 互斥锁
 *
 * 用法:
 *   await this.cache.getOrSet(`user:${id}`, () => this.db.findUser(id), {
 *     ttl: 300, enableLock: true,
 *   });
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // 埋点:命中率(0064 §5.2)
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly redis: RedisService) {}

  /**
   * 查 cache,miss 时回源 fetcher,自动处理 3 大坑
   *
   * @param key        cache key
   * @param fetcher    数据源(DB / API),返回 null 表示"不存在"
   * @param options.ttl        正常数据 TTL(秒),默认 300
   * @param options.nullTtl    空值 TTL(秒),默认 60
   * @param options.enableLock 是否开启击穿防护,默认 false(冷数据别开)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T | null>,
    options?: {
      ttl?: number;
      nullTtl?: number;
      enableLock?: boolean;
    },
  ): Promise<T | null> {
    const ttl = options?.ttl ?? 300;
    const nullTtl = options?.nullTtl ?? 60;

    // ─── 1. 查 cache ───
    const cached = await this.redis.get(key);

    // 2a. 命中"空值"标记(穿透防护)
    if (cached === "__NULL__") {
      this.hitCount++;
      return null;
    }

    // 2b. 命中正常数据
    if (cached) {
      this.hitCount++;
      return JSON.parse(cached) as T;
    }

    // 2c. miss
    this.missCount++;

    // ─── 3. 击穿防护(互斥锁)───
    if (options?.enableLock) {
      const lockKey = `${key}:lock`;
      // SET key value EX 5 NX — 一个原子操作
      // got === true: 抢到锁
      // got === false: 别人已经抢了
      const got = await this.redis.setnx(lockKey, "1", 5);
      if (!got) {
        // 没抢到,等 100ms 让 winner 写完缓存,再来一次
        await new Promise((r) => setTimeout(r, 100));
        return this.getOrSet(key, fetcher, options);
      }
    }

    // ─── 4. 查 DB(只有一个 worker 走到这里)───
    const data = await fetcher();

    // ─── 5. 写 cache ───
    if (data === null || data === undefined) {
      // 5a. 空值也缓存(穿透防护) — 60s 内同请求不再打 DB
      await this.redis.set(key, "__NULL__", nullTtl);
    } else {
      // 5b. 正常数据,TTL 加 ±30s 抖动(雪崩防护)
      // 例:ttl=300,实际 TTL 在 270-330s 之间,避免同时过期
      const jitter = Math.floor(Math.random() * 60 - 30);
      const realTtl = Math.max(60, ttl + jitter);
      await this.redis.set(key, JSON.stringify(data), realTtl);
    }

    return data;
  }

  /**
   * 删除 cache — 业务方在写操作后调用
   * 用 delete 而不是 update:并发写 + cache update 容易出现 ABA 问题
   */
  async invalidate(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * 监控埋点 — 业务方暴露 /metrics 时调用
   * 命中率 < 80% 通常说明:
   *   - TTL 太短
   *   - key 设计有重复
   *   - fetcher 太慢(查不到 → 写不进)
   */
  getStats(): { hitRate: number; hitCount: number; missCount: number } {
    const total = this.hitCount + this.missCount;
    return {
      hitRate: total > 0 ? this.hitCount / total : 0,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }
}
