import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, Process, WorkerHost } from '@nestjs/bull';
import { Job } from 'bull';
import { Client } from '@elastic/elasticsearch';
import { BUSINESS_LINES, BusinessLineCode } from '../libs/shared/index';
import { SyncService } from './sync.service';

@Injectable()
@Processor('sync-full')
export class SyncFullConsumer extends WorkerHost {
  private readonly logger = new Logger(SyncFullConsumer.name);
  private esClient: Client;

  constructor(
    private readonly syncService: SyncService,
    config: ConfigService,
  ) {
    super();
    const esNode = config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.esClient = new Client({ node: esNode });
  }

  @Process('sync')
  async handleFullSync(job: Job) {
    const businessLine = job.data.businessLine as BusinessLineCode;
    this.logger.log(`Processing full sync for ${businessLine} (attempt ${job.attemptsMade + 1})`);

    const products = this.syncService.loadMockData('full');
    const filtered = products.filter((p: any) => p.businessLine === businessLine);

    if (filtered.length === 0) {
      this.logger.warn(`No products found for business line: ${businessLine}`);
      return;
    }

    const index = BUSINESS_LINES[businessLine].esIndex;

    await this.esClient.deleteByQuery({
      index,
      query: { match_all: {} } as any,
    });

    const operations = filtered.flatMap((doc: any) => [
      { index: { _index: index, _id: doc.productId } },
      doc,
    ]);

    await this.esClient.bulk({ operations });
    this.logger.log(`Full sync complete for ${businessLine}: ${filtered.length} products indexed`);
  }
}

@Injectable()
@Processor('sync-incremental')
export class SyncIncrementalConsumer extends WorkerHost {
  private readonly logger = new Logger(SyncIncrementalConsumer.name);
  private esClient: Client;

  constructor(
    private readonly syncService: SyncService,
    config: ConfigService,
  ) {
    super();
    const esNode = config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.esClient = new Client({ node: esNode });
  }

  @Process('sync')
  async handleIncrementalSync(job: Job) {
    const businessLine = job.data.businessLine as BusinessLineCode;
    this.logger.log(`Processing incremental sync for ${businessLine} (attempt ${job.attemptsMade + 1})`);

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
  }
}
