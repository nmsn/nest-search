/**
 * BullMQ 队列配置常量。
 * BullMQ 使用 Redis 作为后端,不需要单独的消息中间件。
 */
export const BULLMQ_QUEUES = {
  syncFull: 'sync-full',
  syncIncremental: 'sync-incremental',
} as const;
