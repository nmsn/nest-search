// TODO(后续 lesson): RABBITMQ_CONFIG.url 改从 ConfigService 读
// 当前 module-level const 在 module 加载时读 process.env.RABBITMQ_URL,
// Zod 已校验但 ConfigService 类型推断不到。 后续转 @Injectable RABBITMQ_CONFIG_SERVICE
export const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  exchanges: {
    sync: 'sync.exchange',
    event: 'event.exchange',
  },
  queues: {
    syncFull: (bl: string) => `sync.full.${bl}.queue`,
    syncIncremental: (bl: string) => `sync.incremental.${bl}.queue`,
    formSubmitted: 'event.form.submitted.queue',
  },
  routingKeys: {
    syncFull: (bl: string) => `sync.full.${bl}`,
    syncIncremental: (bl: string) => `sync.incremental.${bl}`,
    formSubmitted: 'form.submitted',
  },
};
