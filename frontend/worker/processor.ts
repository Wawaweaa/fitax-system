/**
 * 数据处理器 - 负责处理上传的数据文件并生成Parquet
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as parquet from 'parquetjs';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import { updateJob } from '../lib/jobs';
import { ensureDir } from '../lib/server-utils';
import { FactRow, AggRow, Platform, ProcessMode } from '../lib/types';
import { PlatformAdapter } from './adapters/base';
import { generateRowKey, generateRowHash, generateDatasetId, createDataset } from '../lib/datasets';
import { mergeFactRows, mergeDatasetRows } from '../lib/datasets_merge';
import { updateEffectiveView } from '../lib/effective_views';

// Parquet目录
const PARQUET_DIR = path.join(process.cwd(), 'data', 'parquet');
// 事实表目录
const FACT_DIR = path.join(PARQUET_DIR, 'fact_settlement_effective');
// 聚合表目录
const AGG_DIR = path.join(PARQUET_DIR, 'agg_month_sku_effective');

// 处理上下文接口
export interface ProcessContext {
  jobId: string;
  userId: string;
  platform: string;
  year: number;
  month: number;
  mode: ProcessMode;
  settlementUpload: any;
  ordersUpload: any | null;
}

// 处理结果接口
export interface ProcessResult {
  factCount: number;
  aggCount: number;
  warnings: string[];
}

/**
 * 处理数据
 * @param context 处理上下文
 * @param adapter 平台适配器
 * @returns 处理结果
 */
export async function processData(
  context: ProcessContext,
  adapter: PlatformAdapter
): Promise<ProcessResult> {
  // 确保目录存在
  await ensureDir(PARQUET_DIR);
  await ensureDir(FACT_DIR);
  await ensureDir(AGG_DIR);

  // 初始化结果
  const result: ProcessResult = {
    factCount: 0,
    aggCount: 0,
    warnings: []
  };

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 25,
    message: '开始下载文件'
  });

  // 获取结算文件
  const settlementKey = context.settlementUpload.objectKey;
  const settlementBuffer = await storage().getObject(settlementKey);
  const settlementFilePath = path.join(process.cwd(), 'data', 'temp', path.basename(settlementKey));

  // 创建临时目录
  await ensureDir(path.join(process.cwd(), 'data', 'temp'));

  // 写入结算文件
  await fs.writeFile(settlementFilePath, settlementBuffer);

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 30,
    message: '结算文件已下载'
  });

  // 如果有订单文件，也下载
  let ordersFilePath = null;
  if (context.ordersUpload) {
    const ordersKey = context.ordersUpload.objectKey;
    const ordersBuffer = await storage().getObject(ordersKey);
    ordersFilePath = path.join(process.cwd(), 'data', 'temp', path.basename(ordersKey));
    await fs.writeFile(ordersFilePath, ordersBuffer);

    await updateJob(context.jobId, {
      progress: 35,
      message: '订单文件已下载'
    });
  }

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 40,
    message: '开始解析文件'
  });

  // 使用适配器解析文件
  const parsedData = await adapter.parseFiles(
    settlementFilePath,
    ordersFilePath,
    {
      platform: context.platform as Platform,
      year: context.year,
      month: context.month,
      userId: context.userId
    }
  );

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 60,
    message: `解析完成：${parsedData.factRows.length}行事实数据，${parsedData.warnings.length}个警告`
  });

  // 添加警告信息
  result.warnings = [...result.warnings, ...parsedData.warnings];

  // 处理事实表数据
  const factRows: FactRow[] = parsedData.factRows.map(row => {
    // 生成行键和行哈希
    const rowKey = generateRowKey(
      context.platform,
      row.order_id,
      row.internal_sku,
      row.line_no
    );
    const rowHash = generateRowHash(row);

    // 返回增强的行
    return {
      ...row,
      platform: context.platform,
      user_id: context.userId,
      job_id: context.jobId,
      upload_id: context.settlementUpload.id,
      row_key: rowKey,
      row_hash: rowHash
    };
  });

  // 更新结果计数
  result.factCount = factRows.length;

  // 创建聚合行
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
        platform: context.platform,
        upload_id: context.settlementUpload.id,
        job_id: context.jobId,
        year: context.year,
        month: context.month,
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

  // 更新结果计数
  result.aggCount = aggRows.length;

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 70,
    message: `开始生成Parquet文件：${factRows.length}行事实数据，${aggRows.length}行聚合数据`
  });

  // 生成事实表Parquet
  await generateFactParquet(factRows, context);

  // 生成聚合表Parquet
  await generateAggParquet(aggRows, context);

  // 更新作业状态
  await updateJob(context.jobId, {
    progress: 85,
    message: 'Parquet文件生成完成'
  });

  // 处理行键和哈希
  const rowKeyHashMap = factRows.map(row => ({
    rowKey: row.row_key as string,
    rowHash: row.row_hash as string
  }));

  // 如果是merge模式，执行合并
  if (context.mode === 'merge') {
    // 生成数据集ID
    const datasetId = generateDatasetId(
      context.userId,
      context.platform,
      context.year,
      context.month
    );

    try {
      // 更新作业状态
      await updateJob(context.jobId, {
        progress: 90,
        message: '合并数据集行'
      });

      // 创建数据集
      await createDataset({
        id: datasetId,
        userId: context.userId,
        platform: context.platform,
        year: context.year,
        month: context.month,
        uploadId: context.settlementUpload.id,
        metadata: {
          jobId: context.jobId
        }
      });

      // 执行记录合并
      const mergeStats = await mergeDatasetRows(
        datasetId,
        context.settlementUpload.id,
        rowKeyHashMap
      );

      // 记录合并结果
      result.warnings.push(
        `合并统计: 新增 ${mergeStats.inserted}, 更新 ${mergeStats.updated}, 无变化 ${mergeStats.unchanged}`
      );

      if (mergeStats.warnings && mergeStats.warnings.length > 0) {
        result.warnings.push(...mergeStats.warnings);
      }

      // 更新有效视图
      try {
        await updateJob(context.jobId, {
          progress: 95,
          message: '更新有效视图'
        });

        // 执行有效视图更新
        const viewStats = await updateEffectiveView(
          context.userId,
          context.platform,
          context.year,
          context.month
        );

        // 更新结果信息
        result.warnings.push(
          `有效视图更新: ${viewStats.factRowCount}行事实数据, ${viewStats.aggRowCount}行聚合数据`
        );

        if (viewStats.warnings && viewStats.warnings.length > 0) {
          result.warnings.push(...viewStats.warnings);
        }
      } catch (err) {
        result.warnings.push(`更新有效视图失败: ${err.message || err}`);
      }
    } catch (err) {
      result.warnings.push(`合并失败: ${err.message || err}`);
    }
  }

  // 删除临时文件
  try {
    await fs.unlink(settlementFilePath);
    if (ordersFilePath) {
      await fs.unlink(ordersFilePath);
    }
  } catch (err) {
    console.warn('删除临时文件失败:', err);
  }

  // 返回处理结果
  return result;
}

/**
 * 生成事实表Parquet文件
 * @param rows 事实行
 * @param context 处理上下文
 */
async function generateFactParquet(
  rows: FactRow[],
  context: ProcessContext
): Promise<void> {
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
    source_line: { type: 'INT32', optional: true },
    rule_version: { type: 'UTF8', optional: true },
    validation_status: { type: 'UTF8', optional: true },
    validation_warnings: { type: 'UTF8', optional: true }
  });

  // 生成文件名
  const filename = `user_id=${context.userId}/platform=${context.platform}/year=${context.year}/month=${context.month}/job_id=${context.jobId}/fact_settlement.parquet`;
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
      user_id: context.userId,
      row_key: row.row_key,
      row_hash: row.row_hash,
      source_file: row.source_file,
      source_line: row.source_line,
      rule_version: (row as any).rule_version,
      validation_status: (row as any).validation_status,
      validation_warnings: Array.isArray((row as any).validation_warnings)
        ? JSON.stringify((row as any).validation_warnings)
        : (row as any).validation_warnings
    });
  }

  // 关闭写入器
  await writer.close();
}

/**
 * 生成聚合表Parquet文件
 * @param rows 聚合行
 * @param context 处理上下文
 */
async function generateAggParquet(
  rows: AggRow[],
  context: ProcessContext
): Promise<void> {
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
  const filename = `user_id=${context.userId}/platform=${context.platform}/year=${context.year}/month=${context.month}/job_id=${context.jobId}/agg_month_sku.parquet`;
  const filePath = path.join(AGG_DIR, filename);

  // 确保目录存在
  await ensureDir(path.dirname(filePath));

  // 创建写入器
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);

  // 写入行
  for (const row of rows) {
    await writer.appendRow({
      platform: context.platform,
      user_id: context.userId,
      upload_id: row.upload_id,
      job_id: row.job_id,
      year: context.year,
      month: context.month,
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
