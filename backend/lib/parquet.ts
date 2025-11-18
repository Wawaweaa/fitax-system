/**
 * Parquet 文件生成工具
 */
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FactRow, AggRow } from '../../frontend/lib/types';
import { storage } from './storage';
import { generateId, ensureDir } from './utils';

const execFileAsync = promisify(execFile);

/**
 * 将数据写入 JSON 文件
 * @param data 数据数组
 * @param filePath 文件路径
 */
async function writeJsonFile(data: any[], filePath: string): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * 使用 DuckDB 将 JSON 转换为 Parquet
 * @param jsonPath JSON 文件路径
 * @param parquetPath Parquet 文件路径
 * @param schema 表结构（可选）
 */
async function convertJsonToParquet(jsonPath: string, parquetPath: string, schema?: string): Promise<void> {
  // 构建 SQL 查询
  let sql: string;

  if (schema) {
    // 使用指定的架构
    sql = `
      CREATE TABLE temp AS SELECT * FROM read_json('${jsonPath}', schema='${schema}');
      COPY temp TO '${parquetPath}' (FORMAT 'parquet');
      DROP TABLE temp;
    `;
  } else {
    // 自动推断架构
    sql = `
      COPY (SELECT * FROM read_json_auto('${jsonPath}')) TO '${parquetPath}' (FORMAT 'parquet');
    `;
  }

  // 执行 DuckDB 命令
  try {
    await execFileAsync('duckdb', ['-c', sql]);
  } catch (err) {
    console.error('Error converting JSON to Parquet:', err);
    throw err;
  }
}

/**
 * 生成事实表 Parquet 架构
 * @returns 架构字符串
 */
function getFactSchema(): string {
  return `{
    "platform": "VARCHAR",
    "upload_id": "VARCHAR",
    "job_id": "VARCHAR",
    "year": "INTEGER",
    "month": "INTEGER",
    "order_id": "VARCHAR",
    "line_count": "INTEGER",
    "line_no": "INTEGER",
    "internal_sku": "VARCHAR",
    "fin_code": "VARCHAR",
    "qty_sold": "INTEGER",
    "recv_customer": "DECIMAL(10, 2)",
    "recv_platform": "DECIMAL(10, 2)",
    "extra_charge": "DECIMAL(10, 2)",
    "fee_platform_comm": "DECIMAL(10, 2)",
    "fee_affiliate": "DECIMAL(10, 2)",
    "fee_other": "DECIMAL(10, 2)",
    "net_received": "DECIMAL(10, 2)",
    "source_file": "VARCHAR",
    "source_line": "INTEGER"
  }`;
}

/**
 * 生成聚合表 Parquet 架构
 * @returns 架构字符串
 */
function getAggSchema(): string {
  return `{
    "platform": "VARCHAR",
    "upload_id": "VARCHAR",
    "job_id": "VARCHAR",
    "year": "INTEGER",
    "month": "INTEGER",
    "internal_sku": "VARCHAR",
    "qty_sold_sum": "INTEGER",
    "income_total_sum": "DECIMAL(12, 2)",
    "fee_platform_comm_sum": "DECIMAL(12, 2)",
    "fee_other_sum": "DECIMAL(12, 2)",
    "net_received_sum": "DECIMAL(12, 2)",
    "record_count": "INTEGER"
  }`;
}

/**
 * 准备事实表数据
 * @param rows 行数据
 * @param metadata 元数据
 * @returns 处理后的数据
 */
function prepareFactRows(
  rows: FactRow[],
  metadata: { platform: string; uploadId: string; jobId: string }
): any[] {
  return rows.map((row, index) => ({
    platform: metadata.platform,
    upload_id: metadata.uploadId,
    job_id: metadata.jobId,
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
    source_file: '',  // 由适配器填充
    source_line: index + 1,
  }));
}

/**
 * 准备聚合表数据
 * @param rows 行数据
 * @param metadata 元数据
 * @returns 处理后的数据
 */
function prepareAggRows(
  rows: AggRow[],
  metadata: { platform: string; uploadId: string; jobId: string; year: number; month: number }
): any[] {
  return rows.map(row => ({
    platform: metadata.platform,
    upload_id: metadata.uploadId,
    job_id: metadata.jobId,
    year: metadata.year,
    month: metadata.month,
    internal_sku: row.internal_sku,
    qty_sold_sum: row.qty_sold_sum,
    income_total_sum: row.income_total_sum,
    fee_platform_comm_sum: row.fee_platform_comm_sum,
    fee_other_sum: row.fee_other_sum,
    net_received_sum: row.net_received_sum,
    record_count: 1, // 这里应该是聚合的记录数
  }));
}

/**
 * 生成 Parquet 文件
 * @param data 数据（FactRow[] 或 AggRow[]）
 * @param options 选项
 * @returns 生成的文件路径
 */
export async function generateParquet(
  data: FactRow[] | AggRow[],
  options: {
    type: 'fact' | 'agg';
    platform: string;
    uploadId: string;
    jobId: string;
    year: number;
    month: number;
    outputDir?: string;
    uploadToStorage?: boolean;
  }
): Promise<string> {
  // 确定输出目录
  const outputDir = options.outputDir || path.join(process.cwd(), 'parquet');
  await ensureDir(outputDir);

  // 确定文件名和路径
  const fileName = `${options.type}_${generateId()}.parquet`;
  const parquetPath = path.join(outputDir, fileName);
  const jsonPath = path.join(outputDir, `${options.type}_${generateId()}.json`);

  // 准备数据
  let preparedData: any[];
  let schema: string;

  if (options.type === 'fact') {
    preparedData = prepareFactRows(data as FactRow[], {
      platform: options.platform,
      uploadId: options.uploadId,
      jobId: options.jobId,
    });
    schema = getFactSchema();
  } else {
    preparedData = prepareAggRows(data as AggRow[], {
      platform: options.platform,
      uploadId: options.uploadId,
      jobId: options.jobId,
      year: options.year,
      month: options.month,
    });
    schema = getAggSchema();
  }

  try {
    // 先写入 JSON 文件
    await writeJsonFile(preparedData, jsonPath);

    // 转换为 Parquet
    await convertJsonToParquet(jsonPath, parquetPath, schema);

    // 清理临时 JSON 文件
    await fs.unlink(jsonPath);

    // 是否上传到存储
    if (options.uploadToStorage) {
      // 构建对象键
      const objectKey = `parquet/platform=${options.platform}/year=${options.year}/month=${options.month}/${options.type}.parquet`;

      // 读取 Parquet 文件
      const parquetData = await fs.readFile(parquetPath);

      // 上传到存储
      await storage().putObject(objectKey, parquetData, {
        contentType: 'application/octet-stream',
        metadata: {
          'job-id': options.jobId,
          'upload-id': options.uploadId,
        },
      });

      return objectKey;
    }

    return parquetPath;
  } catch (err) {
    // 清理临时文件
    try {
      await fs.unlink(jsonPath).catch(() => {});
      await fs.unlink(parquetPath).catch(() => {});
    } catch {
      // 忽略清理错误
    }

    throw err;
  }
}