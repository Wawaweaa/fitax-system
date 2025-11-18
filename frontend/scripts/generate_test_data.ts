/**
 * 生成测试数据脚本 - 创建合成数据以测试预览和导出功能
 */
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import * as parquet from 'parquetjs';
import { updateJob, createJob } from '../lib/jobs';
import { generateDatasetId, createDataset } from '../lib/datasets';
import { updateEffectiveView } from '../lib/effective_views';
import { ensureDir } from '../lib/server-utils';
import { FactRow, AggRow } from '../lib/types';

// 常量配置
const USER_ID = 'test-user-001';
const PLATFORM = 'wechat_video';
const YEAR = 2025;
const MONTH = 10;

// Parquet目录
const PARQUET_DIR = path.join(process.cwd(), 'data', 'parquet');
// 事实表目录
const FACT_DIR = path.join(PARQUET_DIR, 'fact_settlement_effective');
// 聚合表目录
const AGG_DIR = path.join(PARQUET_DIR, 'agg_month_sku_effective');

/**
 * 生成事实表Parquet文件
 * @param rows 事实行
 * @param jobId 作业ID
 */
async function generateFactParquet(rows: FactRow[], jobId: string): Promise<void> {
  // 定义事实表模式
  const schema = new parquet.ParquetSchema({
    // 标准字段
    year: { type: 'INT32' },
    month: { type: 'INT32' },
    order_id: { type: 'UTF8' },
    line_count: { type: 'INT32', optional: true },
    line_no: { type: 'INT32', optional: true },
    internal_sku: { type: 'UTF8' },
    fin_code: { type: 'UTF8' },
    qty_sold: { type: 'DOUBLE' },
    recv_customer: { type: 'DOUBLE' },
    recv_platform: { type: 'DOUBLE' },
    extra_charge: { type: 'DOUBLE' },
    fee_platform_comm: { type: 'DOUBLE' },
    fee_affiliate: { type: 'DOUBLE' },
    fee_other: { type: 'DOUBLE' },
    net_received: { type: 'DOUBLE' },

    // 元数据字段
    platform: { type: 'UTF8' },
    upload_id: { type: 'UTF8' },
    job_id: { type: 'UTF8' },
    user_id: { type: 'UTF8' },
    row_key: { type: 'UTF8' },
    row_hash: { type: 'UTF8' },
    source_file: { type: 'UTF8', optional: true },
    source_line: { type: 'INT32', optional: true }
  });

  // 生成文件名
  const filename = `user_id=${USER_ID}/platform=${PLATFORM}/year=${YEAR}/month=${MONTH}/job_id=${jobId}/fact_settlement.parquet`;
  const filePath = path.join(FACT_DIR, filename);

  // 确保目录存在
  await ensureDir(path.dirname(filePath));

  // 创建写入器
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);

  // 写入行
  for (const row of rows) {
    await writer.appendRow(row);
  }

  // 关闭写入器
  await writer.close();
}

/**
 * 生成聚合表Parquet文件
 * @param rows 聚合行
 * @param jobId 作业ID
 */
async function generateAggParquet(rows: AggRow[], jobId: string): Promise<void> {
  // 定义聚合表模式
  const schema = new parquet.ParquetSchema({
    // 标准字段
    platform: { type: 'UTF8' },
    user_id: { type: 'UTF8' },
    upload_id: { type: 'UTF8' },
    job_id: { type: 'UTF8' },
    year: { type: 'INT32' },
    month: { type: 'INT32' },
    internal_sku: { type: 'UTF8' },
    qty_sold_sum: { type: 'DOUBLE' },
    income_total_sum: { type: 'DOUBLE' },
    fee_platform_comm_sum: { type: 'DOUBLE' },
    fee_other_sum: { type: 'DOUBLE' },
    net_received_sum: { type: 'DOUBLE' },
    record_count: { type: 'INT32' }
  });

  // 生成文件名
  const filename = `user_id=${USER_ID}/platform=${PLATFORM}/year=${YEAR}/month=${MONTH}/job_id=${jobId}/agg_month_sku.parquet`;
  const filePath = path.join(AGG_DIR, filename);

  // 确保目录存在
  await ensureDir(path.dirname(filePath));

  // 创建写入器
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);

  // 写入行
  for (const row of rows) {
    await writer.appendRow(row);
  }

  // 关闭写入器
  await writer.close();
}

/**
 * 生成测试数据
 */
function generateTestData(): { factRows: FactRow[], aggRows: AggRow[] } {
  const uploadId = `upload-${uuidv4()}`;
  const jobId = `job-${uuidv4()}`;

  // 生成SKU列表
  const skus = [
    { id: 'SKU001', name: '测试产品1' },
    { id: 'SKU002', name: '测试产品2' },
    { id: 'SKU003', name: '测试产品3' },
  ];

  // 生成事实数据行
  const factRows: FactRow[] = [];
  let rowIndex = 1;

  // 为每个SKU生成多条订单记录
  skus.forEach(sku => {
    // 每个SKU生成3-5条订单
    const orderCount = Math.floor(Math.random() * 3) + 3;

    for (let i = 0; i < orderCount; i++) {
      const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const qty = Math.floor(Math.random() * 5) + 1;
      const price = parseFloat((Math.random() * 100 + 50).toFixed(2));
      const platformFee = parseFloat((price * qty * 0.05).toFixed(2));
      const otherFee = parseFloat((price * qty * 0.02).toFixed(2));
      const netReceived = parseFloat((price * qty - platformFee - otherFee).toFixed(2));

      // 生成行键和哈希
      const rowKey = `${USER_ID}:${PLATFORM}:${YEAR}:${MONTH}:${orderId}:${rowIndex}`;
      const rowHash = Buffer.from(rowKey).toString('base64');

      factRows.push({
        // 标准字段
        year: YEAR,
        month: MONTH,
        order_id: orderId,
        line_count: 1,
        line_no: 1,
        internal_sku: sku.id,
        fin_code: `FC-${sku.id}`,
        qty_sold: qty,
        recv_customer: price * qty,
        recv_platform: 0,
        extra_charge: 0,
        fee_platform_comm: platformFee,
        fee_affiliate: 0,
        fee_other: otherFee,
        net_received: netReceived,

        // 元数据字段
        platform: PLATFORM,
        upload_id: uploadId,
        job_id: jobId,
        user_id: USER_ID,
        row_key: rowKey,
        row_hash: rowHash,
        source_file: 'synthetic_test_data.xlsx',
        source_line: rowIndex
      });

      rowIndex++;
    }
  });

  // 生成聚合数据行
  const aggMap = new Map<string, AggRow>();

  // 按SKU分组并聚合
  for (const row of factRows) {
    const key = row.internal_sku;
    const existing = aggMap.get(key);

    if (existing) {
      // 更新现有聚合
      existing.qty_sold_sum += row.qty_sold;
      existing.income_total_sum += (row.recv_customer + row.recv_platform + row.extra_charge);
      existing.fee_platform_comm_sum += row.fee_platform_comm;
      existing.fee_other_sum += (row.fee_affiliate + row.fee_other);
      existing.net_received_sum += row.net_received;
      existing.record_count = (existing.record_count || 0) + 1;
    } else {
      // 创建新聚合
      aggMap.set(key, {
        internal_sku: key,
        platform: PLATFORM,
        upload_id: uploadId,
        job_id: jobId,
        user_id: USER_ID,
        year: YEAR,
        month: MONTH,
        qty_sold_sum: row.qty_sold,
        income_total_sum: row.recv_customer + row.recv_platform + row.extra_charge,
        fee_platform_comm_sum: row.fee_platform_comm,
        fee_other_sum: row.fee_affiliate + row.fee_other,
        net_received_sum: row.net_received,
        record_count: 1
      });
    }
  }

  return {
    factRows,
    aggRows: Array.from(aggMap.values())
  };
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('开始生成测试数据...');

    // 确保目录存在
    await ensureDir(path.join(process.cwd(), 'data', 'parquet'));
    await ensureDir(path.join(process.cwd(), 'data', 'effective'));

    // 创建作业ID
    const jobId = `job-${uuidv4()}`;
    console.log(`创建作业: ${jobId}`);

    // 创建上传记录ID
    const uploadId = `upload-${uuidv4()}`;

    // 创建作业记录
    await createJob({
      id: jobId,
      userId: USER_ID,
      status: 'processing',
      platform: PLATFORM,
      year: YEAR,
      month: MONTH,
      progress: 0,
      message: '开始生成测试数据',
      metadata: {}
    });

    // 生成测试数据
    console.log('生成合成测试数据...');
    const { factRows, aggRows } = generateTestData();

    console.log(`生成了 ${factRows.length} 行事实数据和 ${aggRows.length} 行聚合数据`);

    // 生成Parquet文件
    console.log('生成事实表Parquet文件...');
    await generateFactParquet(factRows, jobId);

    console.log('生成聚合表Parquet文件...');
    await generateAggParquet(aggRows, jobId);

    // 生成数据集ID
    const datasetId = generateDatasetId(USER_ID, PLATFORM, YEAR, MONTH);
    console.log(`数据集ID: ${datasetId}`);

    // 创建数据集
    console.log('创建数据集...');
    await createDataset({
      id: datasetId,
      userId: USER_ID,
      platform: PLATFORM,
      year: YEAR,
      month: MONTH,
      uploadId: uploadId,
      metadata: {
        jobId,
        factCount: factRows.length,
        aggCount: aggRows.length,
        warnings: []
      }
    });

    // 更新有效视图
    console.log('更新有效视图...');
    const viewStats = await updateEffectiveView(USER_ID, PLATFORM, YEAR, MONTH);
    console.log(`有效视图更新: ${viewStats.factRowCount}行事实数据, ${viewStats.aggRowCount}行聚合数据`);

    // 更新作业状态
    await updateJob(jobId, {
      status: 'completed',
      message: '测试数据生成成功',
      progress: 100,
      metadata: {
        datasetId,
        factCount: factRows.length,
        aggCount: aggRows.length,
        warnings: []
      }
    });

    // 打印有效视图路径
    const effectiveDir = path.join(process.cwd(), 'data', 'effective', USER_ID, PLATFORM, YEAR.toString(), MONTH.toString());
    console.log(`有效视图目录: ${effectiveDir}`);
    console.log('预期文件:');
    console.log(`  ${path.join(effectiveDir, 'fact.parquet')}`);
    console.log(`  ${path.join(effectiveDir, 'agg.parquet')}`);

    // 打印作业ID和数据集ID供后续测试使用
    console.log('\n可以使用以下信息进行API测试:');
    console.log(`作业ID: ${jobId}`);
    console.log(`数据集ID: ${datasetId}`);
    console.log(`用户ID: ${USER_ID}`);
    console.log(`平台: ${PLATFORM}`);
    console.log(`年份: ${YEAR}`);
    console.log(`月份: ${MONTH}`);

    console.log('\n数据生成完成!');
  } catch (err) {
    console.error('生成测试数据失败:', err);
    process.exit(1);
  }
}

// 执行主函数
main().catch(console.error);