import { Injectable, OnModuleDestroy } from '@nestjs/common';

/**
 * e2e 用的 in-memory Redis 替身 — 接口跟 RedisService 完全一致
 * 业务侧只用 get/set/del 三个方法,所以用 Map 替身足够。
 */
@Injectable()
export class RedisMemoryService implements OnModuleDestroy {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * 镜像 RedisService.setnx — SET key value EX ttl NX
   * 返回 true = 抢到锁(原本不存在),false = 锁已被占用
   * 内存版用"key 不存在才设"模拟
   */
  async setnx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  /** 给测试用:每个 it 之间清空,避免状态泄漏 */
  clear(): void {
    this.store.clear();
  }

  onModuleDestroy() {
    this.store.clear();
  }
}
