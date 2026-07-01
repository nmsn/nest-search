import { Injectable, BadRequestException } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { BUSINESS_LINES, isValidBusinessLine } from '../libs/shared/index';
import { buildProductSearchQuery, buildAggregationQuery } from './search.queries';

@Injectable()
export class SearchService {
  // 目录 ID → 中文名映射（与 mock 数据 categoryId 一致）
  private readonly CATEGORY_NAME_MAP: Record<number, string> = {
    1001: '商用显示屏',
    1002: '广告机',
    1003: '拼接屏',
    1004: '教学一体机',
    1005: '数字标牌',
    1006: '触控一体机',
    2001: '智能道闸',
    2002: '道闸配件',
    2003: '广告道闸',
    2004: '高速道闸',
    2005: '升降柱',
    3001: '会议平板',
    3002: '智能交互平板',
  };

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
      categoryId?: number;
      brand?: string;
      minPrice?: number;
      maxPrice?: number;
      page?: number;
      size: number;
      searchAfter?: any[];
    },
  ) {
    const index = this.getIndex(businessLine);
    const query = buildProductSearchQuery(params);
    const result = await this.esService.search(index, query);

    const hits = result.hits.hits;
    // 如果翻到最后一页(size < 请求量),nextCursor 为 null
    const nextCursor =
      hits.length === params.size ? hits[hits.length - 1].sort : null;

    return {
      total: result.hits.total,
      page: params.page || null,
      size: params.size,
      items: hits.map((hit: any) => ({
        ...hit._source,
        // 嵌套高亮: 跟 _source 同级,前端用 ._highlight.name 拿高亮后的 HTML
        _highlight: hit.highlight || {},
      })),
      nextCursor,
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
    const result: any = await this.esService.search(index, query);

    return {
      categories: result.aggregations.categories.buckets,
      categoryIds: result.aggregations.categoryIds.buckets.map((b: any) => ({
        id: b.key,
        name: this.CATEGORY_NAME_MAP[b.key] || '未分类',
        count: b.doc_count,
      })),
      brands: result.aggregations.brands.buckets,
      priceStats: result.aggregations.price_stats,
      priceRanges: result.aggregations.price_ranges.buckets,
    };
  }
}
