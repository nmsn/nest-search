/**
 * 指数退避重试工具
 *
 * 用法:
 *   await retry(() => esClient.bulk(...), { maxRetries: 3 });
 *
 * 退避策略: 1s -> 2s -> 4s -> 8s (上限 30s) + 随机 jitter
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: (err: any) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    retryableErrors = () => true,
  } = opts;

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 达到最大重试次数或错误不可重试
      if (attempt >= maxRetries || !retryableErrors(err)) {
        throw err;
      }
      // 指数退避 + jitter（避免雪崩）
      const delay =
        Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) +
        Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
