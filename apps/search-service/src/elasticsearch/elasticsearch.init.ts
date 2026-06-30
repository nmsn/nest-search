import { ElasticsearchService } from './elasticsearch.service';
import { BUSINESS_LINES } from '../libs/shared/index';

// ===== 索引 settings：自定义 analyzer（含同义词） =====
// 这是 ES 8.x 创建索引的完整配置方式
// settings 定义 analyzer / filter
// mappings 定义字段类型
const INDEX_SETTINGS = {
  analysis: {
    filter: {
      // 同义词 filter（从 synonym.txt 加载）
      my_synonym: {
        type: 'synonym_graph',
        synonyms_path: 'analysis-ik/synonym.txt',
        updateable: true,
      },
    },
    analyzer: {
      // 索引时：ik_max_word（细粒度切分）+ 同义词扩展
      ik_index_analyzer: {
        type: 'custom',
        tokenizer: 'ik_max_word',
        filter: ['my_synonym'],
      },
      // 搜索时：ik_smart（粗粒度切分）+ 同义词扩展
      ik_search_analyzer: {
        type: 'custom',
        tokenizer: 'ik_smart',
        filter: ['my_synonym'],
      },
    },
  },
};

// ===== Mapping：字段定义 =====
const PRODUCT_MAPPINGS = {
  properties: {
    productId: { type: 'keyword' },
    name: {
      type: 'text',
      analyzer: 'ik_index_analyzer',     // 索引用 ik_max_word + 同义词
      search_analyzer: 'ik_search_analyzer', // 搜索用 ik_smart + 同义词
    },
    name_pinyin: {
      type: 'text',
      analyzer: 'pinyin',                // 拼音搜索
      fields: {
        keyword: { type: 'keyword' },    // 精确匹配 + 排序
      },
    },
    category: { type: 'keyword' },
    brand: { type: 'keyword' },
    model: { type: 'keyword' },
    spec: {
      type: 'text',
      analyzer: 'ik_index_analyzer',
      search_analyzer: 'ik_search_analyzer',
    },
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
    await esService.createIndexIfNotExists(config.esIndex, {
      settings: INDEX_SETTINGS,
      mappings: PRODUCT_MAPPINGS,
    });
  }
}
