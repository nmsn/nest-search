import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Client } from '@elastic/elasticsearch';
import { BUSINESS_LINES, BusinessLineCode } from '../libs/shared/index';
import { SyncService } from './sync.service';

@Injectable()
@Processor('sync-full', { limiter: { max: 5, duration: 1000 } })
export class SyncFullConsumer extends WorkerHost {
  private esClient: Client;

  constructor(
    private readonly syncService: SyncService,
    config: ConfigService,
    @InjectPinoLogger(SyncFullConsumer.name) private readonly logger: PinoLogger,
  ) {
    super();
    const esNode = config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.esClient = new Client({ node: esNode });
  }

  async process(job: Job) {
    const businessLine = job.data.businessLine as BusinessLineCode;
    this.logger.info(`Processing full sync for ${businessLine} (attempt ${job.attemptsMade + 1})`);

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

    const operations = filtered.flatMap((doc: any) => {
      // 双写 name_pinyin 字段,值与 name 相同
      // ES pinyin analyzer 会自动把中文转拼音
      const docWithPinyin = { ...doc, name_pinyin: doc.name };
      return [
        { index: { _index: index, _id: doc.productId } },
        docWithPinyin,
      ];
    });

    await this.esClient.bulk({ operations });
    this.logger.info(`Full sync complete for ${businessLine}: ${filtered.length} products indexed`);
  }
}

@Injectable()
@Processor('sync-incremental', { limiter: { max: 5, duration: 1000 } })
export class SyncIncrementalConsumer extends WorkerHost {
  private esClient: Client;

  constructor(
    private readonly syncService: SyncService,
    config: ConfigService,
    @InjectPinoLogger(SyncIncrementalConsumer.name) private readonly logger: PinoLogger,
  ) {
    super();
    const esNode = config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.esClient = new Client({ node: esNode });
  }

  async process(job: Job) {
    const businessLine = job.data.businessLine as BusinessLineCode;
    this.logger.info(`Processing incremental sync for ${businessLine} (attempt ${job.attemptsMade + 1})`);

    const products = this.syncService.loadMockData('incremental');
    const filtered = products.filter((p: any) => p.businessLine === businessLine);

    if (filtered.length === 0) {
      this.logger.info(`No incremental data for ${businessLine}`);
      return;
    }

    const index = BUSINESS_LINES[businessLine].esIndex;

    const operations = filtered.flatMap((doc: any) => {
      // 双写 name_pinyin 字段,值与 name 相同
      // ES pinyin analyzer 会自动把中文转拼音
      const docWithPinyin = { ...doc, name_pinyin: doc.name };
      return [
        { index: { _index: index, _id: doc.productId } },
        docWithPinyin,
      ];
    });

    await this.esClient.bulk({ operations });
    this.logger.info(`Incremental sync complete for ${businessLine}: ${filtered.length} products`);
  }
}
