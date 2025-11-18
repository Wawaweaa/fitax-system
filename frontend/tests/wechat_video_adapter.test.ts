/**
 * 微信视频号适配器单元测试
 */
import path from 'path';
import fs from 'fs/promises';
import { WechatVideoAdapter } from '../worker/adapters/wechat_video';
import { Platform } from '../lib/types';

// 测试数据路径
const TEST_DATA_DIR = path.join(process.cwd(), '..', 'demo-data');
const MODEL_SAMPLE_FILE = path.join(TEST_DATA_DIR, 'demo-1024-视频号模型_规则样例_251026.xlsx');
const ORDER_SAMPLE_FILE = path.join(TEST_DATA_DIR, 'demo-视频号订单结算8月_样例_251026.xlsx');

// 测试参数
const TEST_PLATFORM: Platform = 'wechat_video';
const TEST_YEAR = 2024;
const TEST_MONTH = 10;
const TEST_USER_ID = 'test-user-001';

/**
 * 测试字段读取和映射
 */
describe('WechatVideoAdapter - 字段映射', () => {
  let adapter: WechatVideoAdapter;

  beforeAll(() => {
    adapter = new WechatVideoAdapter();
  });

  test('平台基本信息正确', () => {
    expect(adapter.platform).toBe(TEST_PLATFORM);
    expect(adapter.name).toBe('微信视频号');
    expect(adapter.description).toBe('微信视频号电商平台');
  });

  test('解析模型样例文件', async () => {
    // 检查文件是否存在
    await expect(fs.access(MODEL_SAMPLE_FILE)).resolves.not.toThrow();

    // 解析文件
    const result = await adapter.parseFiles(
      MODEL_SAMPLE_FILE,
      null,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    // 验证解析结果
    expect(result).toBeDefined();
    expect(result.factRows).toBeInstanceOf(Array);
    expect(result.warnings).toBeInstanceOf(Array);
  });

  test('解析订单样例文件', async () => {
    // 检查文件是否存在
    await expect(fs.access(ORDER_SAMPLE_FILE)).resolves.not.toThrow();

    // 解析文件
    const result = await adapter.parseFiles(
      ORDER_SAMPLE_FILE,
      null,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    // 验证解析结果
    expect(result).toBeDefined();
    expect(result.factRows).toBeInstanceOf(Array);
    expect(result.warnings).toBeInstanceOf(Array);

    // 至少有一些行被解析出来
    expect(result.factRows.length).toBeGreaterThan(0);

    // 检查第一行数据
    const firstRow = result.factRows[0];
    expect(firstRow).toBeDefined();

    // 验证行键和哈希生成
    expect(firstRow.row_key).toBeDefined();
    expect(firstRow.row_hash).toBeDefined();

    // 验证数据格式和字段类型
    expect(firstRow.year).toBe(TEST_YEAR);
    expect(firstRow.month).toBe(TEST_MONTH);
    expect(typeof firstRow.order_id).toBe('string');
    expect(typeof firstRow.internal_sku).toBe('string');
    expect(typeof firstRow.qty_sold).toBe('number');
    expect(typeof firstRow.recv_customer).toBe('number');
  });

  test('生成行键和哈希值', async () => {
    // 解析文件
    const result = await adapter.parseFiles(
      ORDER_SAMPLE_FILE,
      null,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    // 获取一行有效数据
    const row = result.factRows.find(r => r.order_id && r.internal_sku);
    expect(row).toBeDefined();

    if (row) {
      // 验证行键格式
      const expectedKeyPattern = new RegExp(`^${TEST_PLATFORM}:${row.order_id}:${row.internal_sku}(:\\d+)?$`);
      expect(row.row_key).toMatch(expectedKeyPattern);

      // 验证行哈希格式（SHA-256哈希为64个十六进制字符）
      expect(row.row_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

/**
 * 测试数据聚合
 */
describe('WechatVideoAdapter - 数据聚合', () => {
  let adapter: WechatVideoAdapter;
  let factRows: any[];

  // 聚合函数
  function generateAggregates(factRows: any[]): any[] {
    // SKU分组
    const skuGroups = new Map<string, any[]>();

    // 按SKU分组
    for (const row of factRows) {
      const sku = row.internal_sku;
      const rows = skuGroups.get(sku) || [];
      rows.push(row);
      skuGroups.set(sku, rows);
    }

    // 聚合数据
    const aggRows: any[] = [];

    // 计算聚合
    for (const [sku, rows] of skuGroups.entries()) {
      const aggRow: any = {
        platform: TEST_PLATFORM,
        internal_sku: sku,
        year: TEST_YEAR,
        month: TEST_MONTH,
        qty_sold_sum: 0,
        income_total_sum: 0,
        fee_platform_comm_sum: 0,
        fee_other_sum: 0,
        net_received_sum: 0,
        record_count: rows.length
      };

      // 合计各指标
      for (const row of rows) {
        aggRow.qty_sold_sum += row.qty_sold;
        aggRow.income_total_sum += (row.recv_customer + row.recv_platform + row.extra_charge);
        aggRow.fee_platform_comm_sum += row.fee_platform_comm;
        aggRow.fee_other_sum += (row.fee_affiliate + row.fee_other);
        aggRow.net_received_sum += row.net_received;
      }

      // 四舍五入到2位小数
      aggRow.qty_sold_sum = Math.round(aggRow.qty_sold_sum * 100) / 100;
      aggRow.income_total_sum = Math.round(aggRow.income_total_sum * 100) / 100;
      aggRow.fee_platform_comm_sum = Math.round(aggRow.fee_platform_comm_sum * 100) / 100;
      aggRow.fee_other_sum = Math.round(aggRow.fee_other_sum * 100) / 100;
      aggRow.net_received_sum = Math.round(aggRow.net_received_sum * 100) / 100;

      aggRows.push(aggRow);
    }

    return aggRows;
  }

  beforeAll(async () => {
    // 创建适配器
    adapter = new WechatVideoAdapter();

    // 解析文件获取事实行数据
    const result = await adapter.parseFiles(
      ORDER_SAMPLE_FILE,
      null,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    factRows = result.factRows;
  });

  test('聚合计算结果一致性', async () => {
    // 生成聚合数据
    const aggRows = generateAggregates(factRows);
    expect(aggRows.length).toBeGreaterThan(0);

    // 验证每个聚合行的一致性
    for (const row of aggRows) {
      const expectedNetReceived = row.income_total_sum - row.fee_platform_comm_sum - row.fee_other_sum;
      const roundedExpected = Math.round(expectedNetReceived * 100) / 100;
      const roundedActual = Math.round(row.net_received_sum * 100) / 100;

      // 允许0.02的误差（舍入误差）
      const diff = Math.abs(roundedExpected - roundedActual);
      expect(diff).toBeLessThanOrEqual(0.02);
    }
  });

  test('记录数统计正确', async () => {
    // 生成聚合数据
    const aggRows = generateAggregates(factRows);

    // 验证记录数
    const totalRecords = aggRows.reduce((sum, row) => sum + row.record_count, 0);
    expect(totalRecords).toBe(factRows.length);
  });
});