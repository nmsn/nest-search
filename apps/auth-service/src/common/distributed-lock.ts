// apps/auth-service/src/common/distributed-lock.ts
import { RedisService } from "../redis/redis.service";
import { randomUUID } from "crypto";

export class DistributedLock {
  private readonly lockId: string;

  constructor(
    private readonly redis: RedisService,
    private readonly key: string,
    private readonly ttlSeconds: number = 30,
  ) {
    this.lockId = randomUUID();
  }

  async acquire(): Promise<boolean> {
    return this.redis.setnx(`lock:${this.key}`, this.lockId, this.ttlSeconds);
  }

  async release(): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(
      script,
      [`lock:${this.key}`],
      [this.lockId],
    );
    return result === 1;
  }
}
