/**
 * 微信视频号适配器测试脚本
 *
 * 用于解析并验证微信视频号样例数据
 * 运行方式: ts-node scripts/test-wechat-video-adapter.ts
 */
import fs from 'fs/promises';
import path from 'path';
// Import the adapter directly without file extension
import { WechatVideoAdapter } from '../worker/adapters/wechat_video';
import { FactRow, AggRow } from '../lib/types';

// 样例数据路径
const DEMO_FILE_1 = path.join(process.cwd(), '..', 'demo-1024-视频号模型_规则样例_251026.xlsx');
const DEMO_FILE_2 = path.join(process.cwd(), '..', 'demo-视频号订单结算8月_样例_251026.xlsx');

// 输出目录
const OUTPUT_DIR = path.join(process.cwd(), 'expected', 'wechat_video');

// 测试年月
const TEST_YEAR = 2024;
const TEST_MONTH = 10;
const TEST_USER_ID = 'test-user-001';

/**
 * 生成聚合数据
 */
function generateAggregates(factRows: FactRow[]): AggRow[] {
  // SKU分组
  const skuGroups = new Map<string, FactRow[]>();

  // 按SKU分组
  for (const row of factRows) {
    const sku = row.internal_sku;
    const rows = skuGroups.get(sku) || [];
    rows.push(row);
    skuGroups.set(sku, rows);
  }

  // 聚合数据
  const aggRows: AggRow[] = [];

  // 计算聚合
  for (const [sku, rows] of skuGroups.entries()) {
    const aggRow: AggRow = {
      platform: 'wechat_video',
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

/**
 * 验证聚合数据一致性
 */
function validateAggregates(aggRows: AggRow[]): string[] {
  const warnings: string[] = [];

  for (const row of aggRows) {
    const expectedNetReceived = row.income_total_sum - row.fee_platform_comm_sum - row.fee_other_sum;
    const roundedExpected = Math.round(expectedNetReceived * 100) / 100;
    const roundedActual = Math.round(row.net_received_sum * 100) / 100;

    if (Math.abs(roundedExpected - roundedActual) > 0.02) {
      warnings.push(`SKU ${row.internal_sku} 聚合一致性校验失败: 期望 ${roundedExpected}, 实际 ${roundedActual}`);
    }
  }

  return warnings;
}

/**
 * 生成CSV文件
 */
async function generateCSV(rows: any[], filePath: string, headers: string[]): Promise<void> {
  // 确保目录存在
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  // 生成CSV内容
  const lines: string[] = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'number') {
        // 数字格式化为2位小数
        return value.toFixed(2);
      } else {
        // 字符串需要处理逗号、换行等特殊字符
        return `"${String(value).replace(/"/g, '""')}"`;
      }
    });

    lines.push(values.join(','));
  }

  // 写入文件
  await fs.writeFile(filePath, lines.join('\n'));
  console.log(`已生成CSV文件: ${filePath}`);
}

/**
 * 运行测试
 */
async function runTest(filePath: string, outputName: string): Promise<void> {
  console.log(`测试文件: ${path.basename(filePath)}`);

  try {
    // 创建适配器
    const adapter = new WechatVideoAdapter();

    // 解析文件
    const result = await adapter.parseFiles(
      filePath,
      null,
      {
        platform: 'wechat_video',
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    console.log(`解析结果: ${result.factRows.length}行数据, ${result.warnings.length}个警告`);

    if (result.warnings.length > 0) {
      console.log('警告:');
      result.warnings.forEach((warning, i) => {
        console.log(`  ${i+1}. ${warning}`);
      });
    }

    // 生成聚合数据
    const aggRows = generateAggregates(result.factRows);
    console.log(`生成聚合数据: ${aggRows.length}行`);

    // 验证聚合数据一致性
    const aggWarnings = validateAggregates(aggRows);
    if (aggWarnings.length > 0) {
      console.log('聚合数据警告:');
      aggWarnings.forEach((warning, i) => {
        console.log(`  ${i+1}. ${warning}`);
      });
    } else {
      console.log('聚合数据一致性校验通过');
    }

    // 行键和行哈希检查
    let rowKeyCount = 0;
    let rowHashCount = 0;
    for (const row of result.factRows) {
      if (row.row_key) rowKeyCount++;
      if (row.row_hash) rowHashCount++;
    }
    console.log(`行键生成: ${rowKeyCount}/${result.factRows.length}`);
    console.log(`行哈希生成: ${rowHashCount}/${result.factRows.length}`);

    // 生成预期CSV文件
    const factHeaders = ['year', 'month', 'order_id', 'line_count', 'line_no', 'internal_sku', 'fin_code',
                         'qty_sold', 'recv_customer', 'recv_platform', 'extra_charge', 'fee_platform_comm',
                         'fee_affiliate', 'fee_other', 'net_received', 'platform', 'row_key', 'row_hash'];

    const aggHeaders = ['internal_sku', 'platform', 'year', 'month', 'qty_sold_sum', 'income_total_sum',
                        'fee_platform_comm_sum', 'fee_other_sum', 'net_received_sum', 'record_count'];

    await generateCSV(result.factRows, path.join(OUTPUT_DIR, `${outputName}_fact.csv`), factHeaders);
    await generateCSV(aggRows, path.join(OUTPUT_DIR, `${outputName}_agg.csv`), aggHeaders);

    console.log('测试完成');
  } catch (err: any) {
    console.error(`测试失败:`, err.message || err);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('开始测试微信视频号适配器...');

  // 运行样例1测试
  await runTest(DEMO_FILE_1, 'expected_model');
  console.log('\n');

  // 运行样例2测试
  await runTest(DEMO_FILE_2, 'expected');

  console.log('\n所有测试完成');
}

// 运行测试
main();