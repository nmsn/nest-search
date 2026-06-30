import { BUSINESS_LINES } from '../libs/shared/index';

export function buildProductSearchQuery(params: {
  keyword?: string;
  category?: string;
  brand?: string;
  page?: number;
  size: number;
  searchAfter?: any[];
}) {
  const must: any[] = [];
  const filter: any[] = [];

  if (params.keyword) {
    must.push({
      multi_match: {
        query: params.keyword,
        fields: ['name^3', 'spec', 'brand', 'model'],
      },
    });
  }

  if (params.category) {
    filter.push({ term: { category: params.category } });
  }

  if (params.brand) {
    filter.push({ term: { brand: params.brand } });
  }

  const body: any = {
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    size: params.size,
    sort: [
      { _score: 'desc' },
      { syncedAt: 'desc' },
      { productId: 'asc' }, // ← 唯一字段兜底，保证 search_after 不跳数据/重复
    ],
  };

  // search_after 优先 (深分页)，回退到 from/size (浅分页)
  if (params.searchAfter) {
    body.search_after = params.searchAfter;
  } else if (params.page) {
    body.from = (params.page - 1) * params.size;
  }

  return body;
}

export function buildAggregationQuery() {
  return {
    size: 0,
    aggs: {
      categories: {
        terms: { field: 'category', size: 50 },
      },
      brands: {
        terms: { field: 'brand', size: 50 },
      },
      price_stats: {
        stats: { field: 'price' },
      },
    },
  };
}
