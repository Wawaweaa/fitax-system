/**
 * 处理微信视频号样本的测试脚本 - 绕过API直接使用Worker逻辑
 */
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import * as parquet from 'parquetjs';
import { WechatVideoAdapter } from '../worker/adapters/wechat_video';
import { updateJob, createJob } from '../lib/jobs';
import { generateDatasetId, createDataset, generateRowKey, generateRowHash } from '../lib/datasets';
import { updateEffectiveView } from '../lib/effective_views';
import { ensureDir } from '../lib/server-utils';
import { FactRow, AggRow } from '../lib/types';

// 常量配置
const SAMPLE_FILE_PATH = path.join(process.cwd(), 'data', 'temp', 'wechat_video_sample_data.xlsx');
const USER_ID = 'test-user-001';
const PLATFORM = 'wechat_video';
const YEAR = 2025;
const MONTH = 8;
const MODE = 'merge'; // 'merge' or 'replace'

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
    await writer.appendRow({
      // 标准字段
      year: row.year,
      month: row.month,
      order_id: row.order_id,
      line_count: row.line_count,
      line_no: row.line_no,
      internal_sku: row.internal_sku,
      fin_code: row.fin_code,
      qty_sold: row.qty_sold,
      recv_customer: row.recv_customer,
      recv_platform: row.recv_platform,
      extra_charge: row.extra_charge,
      fee_platform_comm: row.fee_platform_comm,
      fee_affiliate: row.fee_affiliate,
      fee_other: row.fee_other,
      net_received: row.net_received,

      // 元数据字段
      platform: row.platform,
      upload_id: row.upload_id,
      job_id: row.job_id,
      user_id: USER_ID,
      row_key: row.row_key,
      row_hash: row.row_hash,
      source_file: row.source_file,
      source_line: row.source_line
    });
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
    await writer.appendRow({
      platform: PLATFORM,
      user_id: USER_ID,
      upload_id: row.upload_id,
      job_id: row.job_id,
      year: YEAR,
      month: MONTH,
      internal_sku: row.internal_sku,
      qty_sold_sum: row.qty_sold_sum,
      income_total_sum: row.income_total_sum,
      fee_platform_comm_sum: row.fee_platform_comm_sum,
      fee_other_sum: row.fee_other_sum,
      net_received_sum: row.net_received_sum,
      record_count: row.record_count || 0
    });
  }

  // 关闭写入器
  await writer.close();
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('开始处理微信视频号样本文件...');
    console.log(`文件路径: ${SAMPLE_FILE_PATH}`);

    // 确保目录存在
    await ensureDir(path.join(process.cwd(), 'data', 'temp'));
    await ensureDir(path.join(process.cwd(), 'data', 'parquet'));
    await ensureDir(path.join(process.cwd(), 'data', 'effective'));

    // 创建作业ID
    const jobId = `job-${uuidv4()}`;
    console.log(`创建作业: ${jobId}`);

    // 创建上传记录ID（模拟）
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
      message: '开始处理样本文件',
      metadata: {}
    });

    // 检查文件是否存在
    try {
      await fs.access(SAMPLE_FILE_PATH);
    } catch (err) {
      throw new Error(`样本文件不存在: ${SAMPLE_FILE_PATH}`);
    }

    // 创建适配器
    console.log('初始化适配器...');
    const adapter = new WechatVideoAdapter();

    // 直接使用适配器处理文件
    console.log('解析文件...');
    const parseResult = await adapter.parseFiles(
      SAMPLE_FILE_PATH,
      null,
      {
        platform: PLATFORM,
        year: YEAR,
        month: MONTH,
        userId: USER_ID
      }
    );

    console.log(`解析完成: ${parseResult.factRows.length}行数据，${parseResult.warnings.length}个警告`);
    if (parseResult.warnings.length > 0) {
      console.log('警告:');
      parseResult.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    // 处理事实表数据
    console.log('处理事实表数据...');
    const factRows: FactRow[] = parseResult.factRows.map(row => {
      return {
        ...row,
        platform: PLATFORM,
        user_id: USER_ID,
        job_id: jobId,
        upload_id: uploadId,
      };
    });

    // 创建聚合行
    console.log('创建聚合数据...');
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

    // 转换为数组
    const aggRows = Array.from(aggMap.values());

    console.log(`创建了 ${factRows.length} 行事实数据和 ${aggRows.length} 行聚合数据`);

    // 生成Parquet文件
    if (factRows.length > 0) {
      console.log('生成事实表Parquet文件...');
      await generateFactParquet(factRows, jobId);

      console.log('生成聚合表Parquet文件...');
      await generateAggParquet(aggRows, jobId);
    } else {
      console.warn('没有数据行可处理，跳过Parquet文件生成');
    }

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
        warnings: parseResult.warnings
      }
    });

    // 更新有效视图
    console.log('更新有效视图...');
    const viewStats = await updateEffectiveView(USER_ID, PLATFORM, YEAR, MONTH);
    console.log(`有效视图更新: ${viewStats.factRowCount}行事实数据, ${viewStats.aggRowCount}行聚合数据`);

    // 更新作业状态
    await updateJob(jobId, {
      status: 'completed',
      message: '作业处理成功',
      progress: 100,
      metadata: {
        datasetId,
        factCount: factRows.length,
        aggCount: aggRows.length,
        warnings: parseResult.warnings
      }
    });

    // 打印有效视图路径
    const effectiveDir = path.join(process.cwd(), 'data', 'effective', USER_ID, PLATFORM, YEAR.toString(), MONTH.toString());
    console.log(`有效视图目录: ${effectiveDir}`);
    console.log('预期文件:');
    console.log(`  ${path.join(effectiveDir, 'fact.parquet')}`);
    console.log(`  ${path.join(effectiveDir, 'agg.parquet')}`);

    console.log('处理完成!');
  } catch (err) {
    console.error('处理失败:', err);
    process.exit(1);
  }
}

// 执行主函数
main().catch(console.error);