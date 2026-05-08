import { Injectable, BadRequestException } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { BUSINESS_LINES, isValidBusinessLine } from '@app/shared';
import { buildProductSearchQuery, buildAggregationQuery } from './search.queries';

@Injectable()
export class SearchService {
  constructor(private readonly esService: ElasticsearchService) {}

  private getIndex(businessLine: string): string {
    if (!isValidBusinessLine(businessLine)) {
      throw new BadRequestException(`Invalid business line: ${businessLine}`);
    }
    return BUSINESS_LINES[businessLine].esIndex;
  }

  async searchProducts(
    businessLine: string,
    params: {
      keyword?: string;
      category?: string;
      brand?: string;
      page: number;
      size: number;
    },
  ) {
    const index = this.getIndex(businessLine);
    const query = buildProductSearchQuery(params);
    const result = await this.esService.search(index, query);

    return {
      total: result.hits.total,
      page: params.page,
      size: params.size,
      items: result.hits.hits.map((hit: any) => hit._source),
    };
  }

  async getProduct(businessLine: string, productId: string) {
    const index = this.getIndex(businessLine);
    const product = await this.esService.getDocument(index, productId);
    if (!product) {
      throw new BadRequestException(`Product ${productId} not found`);
    }
    return product;
  }

  async getAggregations(businessLine: string) {
    const index = this.getIndex(businessLine);
    const query = buildAggregationQuery();
    const result = await this.esService.search(index, query);

    return {
      categories: result.aggregations.categories.buckets,
      brands: result.aggregations.brands.buckets,
      priceStats: result.aggregations.price_stats,
    };
  }
}
