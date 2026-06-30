import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  public client!: Client;

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
    const exists = await this.client.indices.exists({ index: indexName });
    if (!exists) {
      await this.client.indices.create({
        index: indexName,
        ...body,
      } as any);
      console.log(`Created ES index: ${indexName} (with IK analyzer)`);
    }
  }

  async bulkIndex(indexName: string, documents: any[]) {
    if (documents.length === 0) return;

    const operations = documents.flatMap((doc) => [
      { index: { _index: indexName, _id: doc.productId } },
      doc,
    ]);

    const result = await this.client.bulk({ operations });
    if (result.errors) {
      console.error('Bulk index errors:', result.items.filter((i) => i.index?.error));
    }

    return { indexed: documents.length, errors: result.errors };
  }

  async search(indexName: string, body: any) {
    return this.client.search({ index: indexName, body });
  }

  async getDocument(indexName: string, id: string) {
    try {
      const result = await this.client.get({ index: indexName, id });
      return result._source;
    } catch (error: any) {
      if (error.meta?.statusCode === 404) return null;
      throw error;
    }
  }

  async deleteByQuery(indexName: string, query: any) {
    return this.client.deleteByQuery({ index: indexName, query } as any);
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
}
