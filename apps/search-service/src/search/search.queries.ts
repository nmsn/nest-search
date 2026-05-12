import { BUSINESS_LINES } from '../libs/shared/index';

export function buildProductSearchQuery(params: {
  keyword?: string;
  category?: string;
  brand?: string;
  page: number;
  size: number;
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

  return {
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    from: (params.page - 1) * params.size,
    size: params.size,
    sort: [{ _score: 'desc' }, { syncedAt: 'desc' }],
  };
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
