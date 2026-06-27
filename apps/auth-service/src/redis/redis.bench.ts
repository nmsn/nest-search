import Redis from "ioredis";
import { performance } from "perf_hooks";

const N = 1000;

async function benchSequential(redis: Redis, n: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    await redis.set(`bench:seq:${i}`, `value${i}`);
  }
  return performance.now() - start;
}

async function benchPipeline(redis: Redis, n: number): Promise<number> {
  const pipe = redis.pipeline();
  for (let i = 0; i < n; i++) {
    pipe.set(`bench:pipe:${i}`, `value${i}`);
  }
  const start = performance.now();
  await pipe.exec();
  return performance.now() - start;
}

async function cleanup(redis: Redis) {
  const seqKeys = await redis.keys("bench:seq:*");
  const pipeKeys = await redis.keys("bench:pipe:*");
  const allKeys = [...seqKeys, ...pipeKeys];
  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }
}

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  });

  console.log(`Benchmark: 写入 ${N} 个 key\n`);

  const seqTime = await benchSequential(redis, N);
  console.log(`逐条写入: ${seqTime.toFixed(1)}ms`);

  const pipeTime = await benchPipeline(redis, N);
  console.log(`Pipeline 写入: ${pipeTime.toFixed(1)}ms`);

  console.log(`加速比: ${(seqTime / pipeTime).toFixed(1)}x`);

  await cleanup(redis);
  redis.disconnect();
}

main().catch(console.error);
