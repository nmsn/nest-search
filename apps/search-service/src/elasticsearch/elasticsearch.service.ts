import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { retry, CircuitBreaker } from '../libs/shared/index';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  public client!: Client;
  private readonly logger = new Logger(ElasticsearchService.name);

  // 搜索熔断器: 5 次连续失败 → 熔断 30s
  private searchBreaker = new CircuitBreaker(5, 30000);

  // 写操作熔断器: 阈值更低,写失败说明 ES 严重问题
  private writeBreaker = new CircuitBreaker(3, 30000);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const esNode = this.config.getOrThrow<string>('ELASTICSEARCH_NODE');
    this.client = new Client({ node: esNode });
  }

  async onModuleDestroy() {
    await this.client.close();
  }

  async createIndexIfNotExists(
    indexName: string,
    body: { settings?: any; mappings: any; aliases?: Record<string, any> },
  ) {
    // 创建索引: 不重试（永久错误,重试浪费）
    const exists = await this.client.indices.exists({ index: indexName });
    if (!exists) {
      await this.client.indices.create({
        index: indexName,
        ...body,
      } as any);
      this.logger.log(`Created ES index: ${indexName} (with IK analyzer)`);
    }
  }

  async bulkIndex(indexName: string, documents: any[]) {
    if (documents.length === 0) return;

    const operations = documents.flatMap((doc) => [
      { index: { _index: indexName, _id: doc.productId } },
      doc,
    ]);

    // bulk 写入: 熔断器 + retry（productId 幂等,可重试）
    const result = await this.writeBreaker.execute(() =>
      retry(() => this.client.bulk({ operations }), {
        maxRetries: 3,
        baseDelay: 1000,
      }),
    );

    if (result.errors) {
      this.logger.error(
        'Bulk index errors:',
        result.items.filter((i: any) => i.index?.error),
      );
    }

    return { indexed: documents.length, errors: result.errors };
  }

  async search(indexName: string, body: any) {
    // 搜索: 熔断器 + retry（快重试,baseDelay 短）
    return this.searchBreaker.execute(() =>
      retry(() => this.client.search({ index: indexName, body }), {
        maxRetries: 2,
        baseDelay: 500,
      }),
    );
  }

  async getDocument(indexName: string, id: string) {
    // 读单文档: 熔断器 + retry
    return this.searchBreaker.execute(() =>
      retry(async () => {
        try {
          const result = await this.client.get({ index: indexName, id });
          return result._source;
        } catch (error: any) {
          if (error.meta?.statusCode === 404) return null;
          throw error;
        }
      }),
    );
  }

  async deleteByQuery(indexName: string, query: any) {
    return this.writeBreaker.execute(() =>
      retry(() => this.client.deleteByQuery({ index: indexName, query } as any), {
        maxRetries: 3,
        baseDelay: 1000,
      }),
    );
  }

  // ====== 零停机重建相关工具 (0041) ======

  /**
   * 复制数据: oldIndex → newIndex
   * 调用方需先创建 newIndex
   */
  async reindex(oldIndex: string, newIndex: string) {
    const result = await this.client.reindex({
      refresh: true,
      source: { index: oldIndex },
      dest: { index: newIndex },
    });
    return {
      total: result.total,
      created: result.created,
      updated: result.updated,
      failures: result.failures,
    };
  }

  /**
   * 原子切换 alias 指向
   * fromIndex: 旧索引, toIndex: 新索引
   * ES 内部用事务保证 remove + add 同时生效
   */
  async switchAlias(
    aliasName: string,
    fromIndex: string,
    toIndex: string,
  ) {
    await this.client.indices.updateAliases({
      actions: [
        { remove: { index: fromIndex, alias: aliasName } },
        { add: { index: toIndex, alias: aliasName } },
      ],
    });
  }

  // ====== 熔断器状态查询 (用于健康检查 / 监控) ======

  getSearchBreakerState() {
    return this.searchBreaker.currentState;
  }

  getWriteBreakerState() {
    return this.writeBreaker.currentState;
  }
}
