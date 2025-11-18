/**
 * Vitest 全局设置文件
 */
import { vi } from 'vitest';
import { resetConfig } from '../../lib/config';
import { resetStorage } from '../../lib/storage';
import { getMockStorage } from './utils/mockStorage';

// Import required modules to prevent "module not found" errors
import '../../lib/datasets_merge';
import '../../lib/effective_views';
import '../../lib/effective_view_query';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = './data/test-storage';
process.env.QUEUE_DRIVER = 'inmemory';
process.env.DATABASE_DRIVER = 'duckdb';
process.env.DUCKDB_PATH = './data/test.duckdb';

// 模拟DuckDB模块
vi.mock('../../lib/duckdb', () => ({
  queryFactData: async () => {
    return [
      {
        platform: 'wechat_video',
        year: 2024,
        month: 8,
        order_id: 'TEST-ORDER-001',
        internal_sku: 'TEST-SKU-001',
        qty_sold: 1,
        recv_customer: 100.0,
        net_received: 90.0,
        row_key: 'test-row-key-1',
        row_hash: 'test-row-hash-1'
      },
      {
        platform: 'wechat_video',
        year: 2024,
        month: 8,
        order_id: 'TEST-ORDER-002',
        internal_sku: 'TEST-SKU-002',
        qty_sold: 2,
        recv_customer: 200.0,
        net_received: 180.0,
        row_key: 'test-row-key-2',
        row_hash: 'test-row-hash-2'
      }
    ];
  },
  queryAggData: async () => {
    return [
      {
        platform: 'wechat_video',
        year: 2024,
        month: 8,
        internal_sku: 'TEST-SKU-001',
        qty_sold_sum: 1,
        income_total_sum: 100.0,
        net_received_sum: 90.0
      },
      {
        platform: 'wechat_video',
        year: 2024,
        month: 8,
        internal_sku: 'TEST-SKU-002',
        qty_sold_sum: 2,
        income_total_sum: 200.0,
        net_received_sum: 180.0
      }
    ];
  }
}));

// 模拟存储模块
vi.mock('../../lib/storage', async () => {
  const actual = await vi.importActual('../../lib/storage');
  return {
    ...actual,
    storage: () => getMockStorage()
  };
});

// 全局设置
beforeEach(() => {
  // 重置配置和存储
  resetConfig();
  resetStorage();
});

// 清理
afterEach(() => {
  vi.clearAllMocks();
});