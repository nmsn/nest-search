import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  public client: Client;

  onModuleInit() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });
  }

  async createIndexIfNotExists(indexName: string, mappings: any) {
    const exists = await this.client.indices.exists({ index: indexName });
    if (!exists) {
      await this.client.indices.create({
        index: indexName,
        body: { mappings },
      });
      console.log(`Created ES index: ${indexName}`);
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
    } catch (error) {
      if (error.meta?.statusCode === 404) return null;
      throw error;
    }
  }

  async deleteByQuery(indexName: string, query: any) {
    return this.client.deleteByQuery({ index: indexName, body: { query } });
  }
}
