import { ElasticsearchService } from './elasticsearch.service';
import { BUSINESS_LINES } from '../libs/shared/index';

// ===== 索引 settings：使用 IK 内置 analyzer =====
// ES 8.x 限制: synonym_graph filter 不能用于索引时
// 简化方案: 索引用 ik_max_word,搜索用 ik_smart (内置)
// 同义词功能留给未来升级(可改用 synonym filter 而非 synonym_graph)
const INDEX_SETTINGS = {
  // 不需要自定义 analyzer,直接用 IK 内置的 ik_max_word / ik_smart
};

// ===== Mapping：字段定义 =====
const PRODUCT_MAPPINGS = {
  properties: {
    productId: { type: 'keyword' },
    name: {
      type: 'text',
      analyzer: 'ik_max_word',           // 索引: IK 细粒度
      search_analyzer: 'ik_smart',      // 搜索: IK 粗粒度
    },
    name_pinyin: {
      type: 'text',
      analyzer: 'pinyin',                // 拼音搜索
      fields: {
        keyword: { type: 'keyword' },    // 精确匹配 + 排序
      },
    },
    category: { type: 'keyword' },
    categoryId: { type: 'integer' },
    brand: { type: 'keyword' },
    model: { type: 'keyword' },
    spec: {
      type: 'text',
      analyzer: 'ik_max_word',
      search_analyzer: 'ik_smart',
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

// 当前索引版本号（升级 mapping 时递增，如 v1 → v2）
const CURRENT_INDEX_VERSION = 'v1';

// 实际索引名 = alias名_版本号，例如 products_ds_v1
function getRealIndexName(alias: string): string {
  return `${alias}_${CURRENT_INDEX_VERSION}`;
}

export async function initIndices(esService: ElasticsearchService) {
  for (const [, config] of Object.entries(BUSINESS_LINES)) {
    const alias = config.esIndex;             // 'products_ds' (逻辑名,业务代码用这个)
    const realIndex = getRealIndexName(alias); // 'products_ds_v1' (实际索引)

    // 启动时: 创建带 alias 的索引
    // 用户搜的是 alias,实际指向 realIndex
    // 未来改 mapping: 创建 v2 → reindex → 切换 alias → 删 v1 (零停机)
    await esService.createIndexIfNotExists(realIndex, {
      aliases: { [alias]: {} },
      mappings: PRODUCT_MAPPINGS,
    });
    console.log(`Index ready: ${realIndex} (alias: ${alias})`);
  }
}
