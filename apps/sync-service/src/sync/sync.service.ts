import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy, Client, Transport } from '@nestjs/microservices';
import { RABBITMQ_CONFIG, BUSINESS_LINES, BusinessLineCode } from '@app/shared';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  @Client({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_CONFIG.url],
      queue: 'sync-service-producer',
      queueOptions: { durable: false },
    },
  })
  private client!: ClientProxy;

  async onModuleInit() {
    await this.client.connect();
    this.logger.log('Connected to RabbitMQ');
  }

  async triggerFullSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering full sync for ${businessLine}`);
    const message = {
      businessLine,
      type: 'full' as const,
      triggeredBy: 'manual' as const,
      timestamp: new Date(),
    };

    this.client.emit(RABBITMQ_CONFIG.routingKeys.syncFull(businessLine), message);
    return { status: 'queued', type: 'full', businessLine };
  }

  async triggerIncrementalSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering incremental sync for ${businessLine}`);
    const message = {
      businessLine,
      type: 'incremental' as const,
      triggeredBy: 'manual' as const,
      lastSyncTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      timestamp: new Date(),
    };

    this.client.emit(RABBITMQ_CONFIG.routingKeys.syncIncremental(businessLine), message);
    return { status: 'queued', type: 'incremental', businessLine };
  }

  loadMockData(type: 'full' | 'incremental') {
    const fileName = type === 'full' ? 'products-full.json' : 'products-incremental.json';
    const filePath = path.join(process.cwd(), 'data', fileName);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    return data.map((product: any) => ({
      ...product,
      syncedAt: new Date().toISOString(),
    }));
  }
}
