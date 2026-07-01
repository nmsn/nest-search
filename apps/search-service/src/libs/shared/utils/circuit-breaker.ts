/**
 * 熔断器（Circuit Breaker）
 *
 * 状态机:
 *   CLOSED (关闭)    - 正常调用
 *   OPEN (打开)      - 快速失败
 *   HALF_OPEN (半开) - 试探性恢复
 *
 * 用法:
 *   const breaker = new CircuitBreaker(5, 30000);
 *   await breaker.execute(() => esClient.search(...));
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextAttemptTime = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 30000,
  ) {}

  get currentState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker is OPEN (retry at ${new Date(this.nextAttemptTime).toISOString()})`,
        );
      }
      // 冷却时间到，进入半开试探
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }
}
