/**
 * 微信视频号适配器单元测试
 */
import { describe, test, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { WechatVideoAdapter } from '../../../worker/adapters/wechat_video';
import { Platform } from '../../../lib/types';
import { generateRowKey, generateRowHash } from '../../../lib/datasets';

// 测试数据路径
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'samples');
const TEST_FILE = path.join(TEST_DATA_DIR, 'wechat_video_sample.csv');

// 测试参数
const TEST_PLATFORM: Platform = 'wechat_video';
const TEST_YEAR = 2024;
const TEST_MONTH = 10;
const TEST_USER_ID = 'test-user-001';

/**
 * 微信视频号适配器单元测试
 */
describe('WechatVideoAdapter', () => {
  let adapter: WechatVideoAdapter;

  // 在所有测试前执行
  beforeAll(() => {
    adapter = new WechatVideoAdapter();
  });

  test('平台信息正确', () => {
    expect(adapter.platform).toBe(TEST_PLATFORM);
    expect(adapter.name).toBe('微信视频号');
    expect(adapter.description).toBe('微信视频号电商平台');
  });

  test('解析CSV文件', async () => {
    // 检查文件是否存在
    try {
      await fs.access(TEST_FILE);
    } catch (err) {
      throw new Error(`测试文件不存在: ${TEST_FILE}`);
    }

    // 解析文件
    const result = await adapter.parseFiles(
      TEST_FILE,
      null,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    // 验证有数据返回
    expect(result).toBeDefined();
    expect(result.factRows).toBeInstanceOf(Array);
    expect(result.warnings).toBeInstanceOf(Array);

    // 验证解析数据非空
    expect(result.factRows.length).toBeGreaterThan(0);

    // 测试第一行数据
    const firstRow = result.factRows[0];
    expect(firstRow).toBeDefined();

    // 验证年月设置正确
    expect(firstRow.year).toBe(TEST_YEAR);
    expect(firstRow.month).toBe(TEST_MONTH);

    // 验证字段解析正确
    expect(typeof firstRow.order_id).toBe('string');
    expect(typeof firstRow.internal_sku).toBe('string');
    expect(typeof firstRow.qty_sold).toBe('number');
    expect(typeof firstRow.recv_customer).toBe('number');
    expect(typeof firstRow.recv_platform).toBe('number');
    expect(typeof firstRow.extra_charge).toBe('number');
    expect(typeof firstRow.fee_platform_comm).toBe('number');
    expect(typeof firstRow.fee_affiliate).toBe('number');
    expect(typeof firstRow.fee_other).toBe('number');
    expect(typeof firstRow.net_received).toBe('number');

    // 验证关键字段非空
    expect(firstRow.order_id).not.toBe('');
    expect(firstRow.internal_sku).not.toBe('');

    // 验证行键和哈希生成
    expect(firstRow.row_key).toBeDefined();
    expect(firstRow.row_hash).toBeDefined();

    // 验证行键格式
    const expectedKeyPattern = new RegExp(`^${TEST_PLATFORM}:${firstRow.order_id}:${firstRow.internal_sku}(:\\d+)?$`);
    expect(firstRow.row_key).toMatch(expectedKeyPattern);

    // 验证行哈希格式（SHA-256哈希为64个十六进制字符）
    expect(firstRow.row_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('三段式数量计算', async () => {
    // 创建测试数据
    const testData = [
      { qty: 10, expected: 10 },    // 正数保持不变
      { qty: 0, expected: 0 },      // 零保持不变
      { qty: -5, expected: 0 },     // -30~0 区间映射为0
      { qty: -30, expected: -1 },   // -30映射为-1
      { qty: -50, expected: -1 },   // <-30映射为-1
    ];

    // 测试每个数据点
    for (const { qty, expected } of testData) {
      const mockRow = {
        订单号: 'TEST-ORDER',
        商品编码: 'TEST-SKU',
        数量: qty,
        实收金额: 100,
        平台补贴: 0,
        附加费用: 0,
        平台佣金: 15,
        分销服务费: 0,
        其他费用: 0,
        结算金额: 85
      };

      // 映射数据
      const result = (adapter as any).mapRowToFactRow(
        mockRow,
        {
          platform: TEST_PLATFORM,
          year: TEST_YEAR,
          month: TEST_MONTH,
          userId: TEST_USER_ID
        },
        'test-file.csv',
        1
      );

      // 验证三段式计算结果
      expect(result.qty_sold).toBe(expected);
    }
  });

  test('金额恒等式验证', async () => {
    // 有效案例：金额一致
    const validRow = {
      订单号: 'TEST-ORDER',
      商品编码: 'TEST-SKU',
      数量: 1,
      实收金额: 100,       // I
      平台补贴: 20,        // J
      附加费用: 0,         // K
      平台佣金: 15,        // L
      分销服务费: 5,       // M
      其他费用: 0,         // N
      结算金额: 100        // O = I+J+K-L-M-N = 100+20+0-15-5-0 = 100
    };

    // 无效案例：金额不一致
    const invalidRow = {
      订单号: 'TEST-ORDER',
      商品编码: 'TEST-SKU',
      数量: 1,
      实收金额: 100,
      平台补贴: 20,
      附加费用: 0,
      平台佣金: 15,
      分销服务费: 5,
      其他费用: 0,
      结算金额: 90         // 不等于 I+J+K-L-M-N = 100
    };

    // 测试有效案例
    const validResult = (adapter as any).mapRowToFactRow(
      validRow,
      {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      },
      'test-file.csv',
      1
    );

    // 验证有效案例映射成功
    expect(validResult).toBeDefined();
    expect(validResult.net_received).toBe(100);

    // 测试无效案例，应抛出异常
    expect(() => {
      (adapter as any).mapRowToFactRow(
        invalidRow,
        {
          platform: TEST_PLATFORM,
          year: TEST_YEAR,
          month: TEST_MONTH,
          userId: TEST_USER_ID
        },
        'test-file.csv',
        1
      );
    }).toThrow(/金额恒等式不成立/);
  });

  test('行键和行哈希生成', async () => {
    // 测试行键生成
    const testRow = {
      order_id: 'TEST-ORDER-123',
      internal_sku: 'SKU-456',
      qty_sold: 1,
      recv_customer: 100,
      recv_platform: 20,
      extra_charge: 0,
      fee_platform_comm: 15,
      fee_affiliate: 5,
      fee_other: 0,
      net_received: 100
    };

    // 无行号情况
    const keyWithoutLineNo = generateRowKey(
      TEST_PLATFORM,
      testRow.order_id,
      testRow.internal_sku
    );
    expect(keyWithoutLineNo).toBe(`${TEST_PLATFORM}:${testRow.order_id}:${testRow.internal_sku}`);

    // 有行号情况
    const lineNo = 5;
    const keyWithLineNo = generateRowKey(
      TEST_PLATFORM,
      testRow.order_id,
      testRow.internal_sku,
      lineNo
    );
    expect(keyWithLineNo).toBe(`${TEST_PLATFORM}:${testRow.order_id}:${testRow.internal_sku}:${lineNo}`);

    // 测试哈希生成
    const hash = generateRowHash(testRow);
    expect(hash).toBeDefined();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // 验证哈希值一致性
    const sameRow = { ...testRow };
    const sameHash = generateRowHash(sameRow);
    expect(sameHash).toBe(hash);

    // 验证哈希值变化
    const changedRow = { ...testRow, qty_sold: 2 };
    const changedHash = generateRowHash(changedRow);
    expect(changedHash).not.toBe(hash);
  });
});