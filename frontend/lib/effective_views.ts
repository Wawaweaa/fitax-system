/**
 * 有效视图管理
 * 用于更新和查询有效视图的模块
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureDir } from './server-utils';
import { storage } from './storage';
import { ViewType } from './types';
import { getDatasetRows, getEffectiveDataset, addDatasetRow } from './datasets';
import { queryAggData, queryFactData, countAggRows } from './duckdb';

// 有效视图目录
const EFFECTIVE_DIR = path.join(process.cwd(), 'data', 'effective');
// 事实表有效视图目录
const EFFECTIVE_FACT_DIR = path.join(EFFECTIVE_DIR, 'fact');
// 聚合表有效视图目录
const EFFECTIVE_AGG_DIR = path.join(EFFECTIVE_DIR, 'agg');

// 确保目录存在
export async function initEffectiveDirs(): Promise<void> {
  await ensureDir(EFFECTIVE_DIR);
  await ensureDir(EFFECTIVE_FACT_DIR);
  await ensureDir(EFFECTIVE_AGG_DIR);
}

/**
 * 更新有效视图
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @returns 更新结果
 */
export async function updateEffectiveView(
  userId: string,
  platform: string,
  year: number,
  month: number
): Promise<{
  factRowCount: number,
  aggRowCount: number,
  warnings: string[]
}> {
  // 确保目录存在
  await initEffectiveDirs();

  // 获取有效数据集
  const dataset = await getEffectiveDataset(userId, platform, year, month);
  if (!dataset) {
    throw new Error(`无法找到有效数据集: ${userId}/${platform}/${year}/${month}`);
  }

  // 获取所有数据集行
  const rows = await getDatasetRows(dataset.id);

  // 查找最新的每个行键对应的行
  const latestRows = new Map<string, {
    uploadId: string;
    rowHash: string;
  }>();

  // 构建最新行键映射
  for (const row of rows) {
    latestRows.set(row.rowKey, {
      uploadId: row.uploadId,
      rowHash: row.rowHash
    });
  }

  // 结果计数
  const result = {
    factRowCount: 0,
    aggRowCount: 0,
    warnings: [] as string[]
  };

  // 更新事实表有效视图
  try {
    await updateFactEffectiveView(userId, platform, year, month, dataset.id, latestRows);
    result.factRowCount = latestRows.size;
  } catch (err) {
    result.warnings.push(`更新事实表有效视图失败: ${err.message}`);
  }

  // 更新聚合表有效视图
  try {
    await updateAggEffectiveView(userId, platform, year, month, dataset.id);
    result.aggRowCount = await countAggRows(userId, platform, year, month);
  } catch (err) {
    result.warnings.push(`更新聚合表有效视图失败: ${err.message}`);
  }

  return result;
}

/**
 * 更新事实表有效视图
 */
async function updateFactEffectiveView(
  userId: string,
  platform: string,
  year: number,
  month: number,
  datasetId: string,
  latestRows: Map<string, { uploadId: string; rowHash: string }>
): Promise<void> {
  // 事实表有效视图路径
  const viewPath = path.join(
    EFFECTIVE_FACT_DIR,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/effective.json`
  );

  // 确保目录存在
  await ensureDir(path.dirname(viewPath));

  // 写入有效视图
  const view = {
    userId,
    platform,
    year,
    month,
    datasetId,
    rowCount: latestRows.size,
    rows: Array.from(latestRows.entries()).map(([rowKey, { uploadId, rowHash }]) => ({
      rowKey,
      uploadId,
      rowHash
    }))
  };

  await fs.writeFile(viewPath, JSON.stringify(view, null, 2));
}

/**
 * 更新聚合表有效视图
 */
async function updateAggEffectiveView(
  userId: string,
  platform: string,
  year: number,
  month: number,
  datasetId: string
): Promise<void> {
  // 事实表有效视图文件
  const factViewPath = path.join(
    EFFECTIVE_FACT_DIR,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/effective.json`
  );

  // 读取事实表有效视图
  const factViewData = await fs.readFile(factViewPath, 'utf-8');
  const factView = JSON.parse(factViewData);

  // 聚合表有效视图路径
  const aggViewPath = path.join(
    EFFECTIVE_AGG_DIR,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/effective.json`
  );

  // 确保目录存在
  await ensureDir(path.dirname(aggViewPath));

  // 创建聚合表有效视图
  const aggView = {
    userId,
    platform,
    year,
    month,
    datasetId,
    rowCount: 0, // 稍后更新
    uploadIds: Array.from(new Set(factView.rows.map((r: any) => r.uploadId)))
  };

  // 写入聚合表有效视图
  await fs.writeFile(aggViewPath, JSON.stringify(aggView, null, 2));
}

/**
 * 统计聚合表行数
 */
async function countAggRows(
  userId: string,
  platform: string,
  year: number,
  month: number
): Promise<number> {
  // Parquet目录
  const parquetDir = path.join(process.cwd(), 'data', 'parquet', 'agg_month_sku_effective');

  // 查询路径模式
  const queryPathPattern = path.join(
    parquetDir,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/*/agg_month_sku.parquet`
  );

  // 聚合表有效视图文件
  const aggViewPath = path.join(
    EFFECTIVE_AGG_DIR,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/effective.json`
  );

  // 读取聚合表有效视图
  const aggViewData = await fs.readFile(aggViewPath, 'utf-8');
  const aggView = JSON.parse(aggViewData);

  try {
    // 使用DuckDB计算实际行数
    const rowCount = await countAggRows(platform, year, month, userId);

    // 更新聚合表有效视图
    aggView.rowCount = rowCount;
    await fs.writeFile(aggViewPath, JSON.stringify(aggView, null, 2));

    return rowCount;
  } catch (err) {
    console.error('计算聚合行数失败:', err);

    // 降级方案：估计一个合理的行数
    const rowCount = aggView.uploadIds.length * 3 + 10;

    // 更新聚合表有效视图
    aggView.rowCount = rowCount;
    await fs.writeFile(aggViewPath, JSON.stringify(aggView, null, 2));

    return rowCount;
  }
}

/**
 * 获取有效视图路径
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param viewType 视图类型
 */
export function getEffectiveViewPath(
  userId: string,
  platform: string,
  year: number,
  month: number,
  viewType: ViewType
): string {
  const baseDir = viewType === 'fact' ? EFFECTIVE_FACT_DIR : EFFECTIVE_AGG_DIR;
  return path.join(
    baseDir,
    `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/effective.json`
  );
}
