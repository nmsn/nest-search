import { Injectable, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Client } from '@elastic/elasticsearch';
import { RABBITMQ_CONFIG, BUSINESS_LINES, BusinessLineCode } from '@app/shared';
import { SyncService } from './sync.service';

@Injectable()
export class SyncConsumer {
  private readonly logger = new Logger(SyncConsumer.name);
  private esClient: Client;
  private retryCount = new Map<string, number>();

  constructor(private readonly syncService: SyncService) {
    this.esClient = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });
  }

  @EventPattern('sync.full.ds')
  async handleFullSyncDs(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('ds', data, context);
  }

  @EventPattern('sync.full.zk')
  async handleFullSyncZk(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('zk', data, context);
  }

  @EventPattern('sync.full.meeting')
  async handleFullSyncMeeting(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processFullSync('meeting', data, context);
  }

  @EventPattern('sync.incremental.ds')
  async handleIncrementalSyncDs(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('ds', data, context);
  }

  @EventPattern('sync.incremental.zk')
  async handleIncrementalSyncZk(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('zk', data, context);
  }

  @EventPattern('sync.incremental.meeting')
  async handleIncrementalSyncMeeting(@Payload() data: any, @Ctx() context: RmqContext) {
    await this.processIncrementalSync('meeting', data, context);
  }

  private async processFullSync(businessLine: BusinessLineCode, data: any, context: RmqContext) {
    this.logger.log(`Processing full sync for ${businessLine}`);
    const pattern = `sync.full.${businessLine}`;

    try {
      const products = this.syncService.loadMockData('full');
      const filtered = products.filter((p: any) => p.businessLine === businessLine);

      if (filtered.length === 0) {
        this.logger.warn(`No products found for business line: ${businessLine}`);
        return;
      }

      const index = BUSINESS_LINES[businessLine].esIndex;

      await this.esClient.deleteByQuery({
        index,
        body: { query: { match_all: {} } },
      });

      const operations = filtered.flatMap((doc: any) => [
        { index: { _index: index, _id: doc.productId } },
        doc,
      ]);

      await this.esClient.bulk({ operations });
      this.logger.log(`Full sync complete for ${businessLine}: ${filtered.length} products indexed`);

      this.retryCount.delete(pattern);
    } catch (error) {
      this.logger.error(`Full sync failed for ${businessLine}: ${error.message}`);
      this.handleRetry(context, pattern);
    }
  }

  private async processIncrementalSync(businessLine: BusinessLineCode, data: any, context: RmqContext) {
    this.logger.log(`Processing incremental sync for ${businessLine}`);
    const pattern = `sync.incremental.${businessLine}`;

    try {
      const products = this.syncService.loadMockData('incremental');
      const filtered = products.filter((p: any) => p.businessLine === businessLine);

      if (filtered.length === 0) {
        this.logger.log(`No incremental data for ${businessLine}`);
        return;
      }

      const index = BUSINESS_LINES[businessLine].esIndex;

      const operations = filtered.flatMap((doc: any) => [
        { index: { _index: index, _id: doc.productId } },
        doc,
      ]);

      await this.esClient.bulk({ operations });
      this.logger.log(`Incremental sync complete for ${businessLine}: ${filtered.length} products`);

      this.retryCount.delete(pattern);
    } catch (error) {
      this.logger.error(`Incremental sync failed for ${businessLine}: ${error.message}`);
      this.handleRetry(context, pattern);
    }
  }

  private handleRetry(context: RmqContext, pattern: string) {
    const currentRetries = this.retryCount.get(pattern) || 0;
    if (currentRetries < 3) {
      this.retryCount.set(pattern, currentRetries + 1);
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.nack(originalMsg, false, true);
      this.logger.warn(`Retrying ${pattern} (attempt ${currentRetries + 1}/3)`);
    } else {
      this.logger.error(`Max retries reached for ${pattern}`);
      this.retryCount.delete(pattern);
    }
  }
}
