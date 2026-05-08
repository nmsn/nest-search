import { ElasticsearchService } from './elasticsearch.service';
import { BUSINESS_LINES } from '@app/shared';

const PRODUCT_MAPPINGS = {
  properties: {
    productId: { type: 'keyword' },
    name: { type: 'text', analyzer: 'standard' },
    category: { type: 'keyword' },
    brand: { type: 'keyword' },
    model: { type: 'keyword' },
    spec: { type: 'text' },
    price: { type: 'float' },
    unit: { type: 'keyword' },
    stock: { type: 'integer' },
    imageUrl: { type: 'keyword', index: false },
    attributes: { type: 'object', enabled: false },
    syncedAt: { type: 'date' },
    businessLine: { type: 'keyword' },
  },
};

export async function initIndices(esService: ElasticsearchService) {
  for (const [, config] of Object.entries(BUSINESS_LINES)) {
    await esService.createIndexIfNotExists(config.esIndex, PRODUCT_MAPPINGS);
  }
}
