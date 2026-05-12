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
