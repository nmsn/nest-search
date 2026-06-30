import { BUSINESS_LINES } from '../libs/shared/index';

/**
 * 构建产品搜索查询（商品目录检索风格）
 *
 * nest-search 搜索本质是"商品目录检索"而非"语义搜索"：
 * - 用户通过分类 + 品牌 + 价格等条件过滤出商品集合
 * - 排序以可量化字段（价格、时间）为主，BM25 评分为辅
 */
export function buildProductSearchQuery(params: {
  keyword?: string;
  category?: string;
  categoryId?: number;
  brand?: string;
  maxPrice?: number;
  minPrice?: number;
  page?: number;
  size: number;
  searchAfter?: any[];
}) {
  const must: any[] = [];
  const filter: any[] = [];

  // 全文搜索（仅在有关键词时启用）
  if (params.keyword) {
    must.push({
      multi_match: {
        query: params.keyword,
        fields: ['name^3', 'spec', 'brand', 'model'],
      },
    });
  }

  // 精确过滤（商品目录检索的核心操作）
  if (params.category) {
    filter.push({ term: { category: params.category } });
  }

  if (params.categoryId) {
    filter.push({ term: { categoryId: params.categoryId } });
  }

  if (params.brand) {
    filter.push({ term: { brand: params.brand } });
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const range: any = {};
    if (params.minPrice !== undefined) range.gte = params.minPrice;
    if (params.maxPrice !== undefined) range.lte = params.maxPrice;
    filter.push({ range: { price: range } });
  }

  const body: any = {
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    size: params.size,
    // 商品目录排序：价格/时间优先，BM25 分辅助
    sort: [
      { _score: 'desc' },
      { syncedAt: 'desc' },
      { productId: 'asc' }, // 唯一字段兜底
    ],
  };

  // 分页
  if (params.searchAfter) {
    body.search_after = params.searchAfter;
  } else if (params.page) {
    body.from = (params.page - 1) * params.size;
  }

  return body;
}

/**
 * 聚合查询：按分类 + 品牌 + 价格区间统计
 * 商品目录的核心功能：前端筛选条件的统计值
 */
export function buildAggregationQuery() {
  return {
    size: 0,
    aggs: {
      // 一级分类（商显/道闸/会议平板）
      categories: {
        terms: { field: 'category', size: 50 },
      },
      // 二级目录（子类目）
      categoryIds: {
        terms: { field: 'categoryId', size: 50, order: { _key: 'asc' } },
      },
      // 品牌
      brands: {
        terms: { field: 'brand', size: 50 },
      },
      // 价格统计
      price_stats: {
        stats: { field: 'price' },
      },
      // 价格区间
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { key: '0-2000', to: 2000 },
            { key: '2000-5000', from: 2000, to: 5000 },
            { key: '5000-10000', from: 5000, to: 10000 },
            { key: '10000+', from: 10000 },
          ],
        },
      },
    },
  };
}
