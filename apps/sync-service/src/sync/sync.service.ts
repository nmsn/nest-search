import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BUSINESS_LINES, BusinessLineCode } from '../libs/shared/index';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectQueue('sync-full') private fullQueue: Queue,
    @InjectQueue('sync-incremental') private incrementalQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('BullMQ queues ready');
  }

  async onModuleDestroy() {
    await this.fullQueue.close();
    await this.incrementalQueue.close();
  }

  async triggerFullSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering full sync for ${businessLine}`);
    const job = await this.fullQueue.add(
      'sync',
      {
        businessLine,
        type: 'full' as const,
        triggeredBy: 'manual' as const,
        timestamp: new Date(),
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return { status: 'queued', type: 'full', businessLine, jobId: job.id };
  }

  async triggerIncrementalSync(businessLine: BusinessLineCode) {
    this.logger.log(`Triggering incremental sync for ${businessLine}`);
    const job = await this.incrementalQueue.add(
      'sync',
      {
        businessLine,
        type: 'incremental' as const,
        triggeredBy: 'manual' as const,
        lastSyncTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        timestamp: new Date(),
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    return { status: 'queued', type: 'incremental', businessLine, jobId: job.id };
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
