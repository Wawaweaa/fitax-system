/**
 * 有效视图查询模块
 * 根据有效视图元数据查询数据
 */
import fs from 'fs/promises';
import path from 'path';
import { getEffectiveViewPath } from './effective_views';
import { ViewType } from './types';

// Parquet目录
const PARQUET_DIR = path.join(process.cwd(), 'data', 'parquet');
// 事实表目录
const FACT_DIR = path.join(PARQUET_DIR, 'fact_settlement_effective');
// 聚合表目录
const AGG_DIR = path.join(PARQUET_DIR, 'agg_month_sku_effective');

/**
 * 获取有效视图元数据
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param viewType 视图类型
 */
export async function getEffectiveViewMeta(
  userId: string,
  platform: string,
  year: number,
  month: number,
  viewType: ViewType
): Promise<any> {
  const viewPath = getEffectiveViewPath(userId, platform, year, month, viewType);

  try {
    const viewData = await fs.readFile(viewPath, 'utf-8');
    return JSON.parse(viewData);
  } catch (err) {
    // 文件不存在或无法解析
    return null;
  }
}

/**
 * 构建事实表查询路径
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param jobId 作业ID
 */
export function buildFactQueryPath(
  userId: string,
  platform: string,
  year: number,
  month: number,
  jobId?: string
): string {
  if (jobId) {
    return path.join(FACT_DIR, `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/job_id=${jobId}/fact_settlement.parquet`);
  } else {
    return path.join(FACT_DIR, `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/*/fact_settlement.parquet`);
  }
}

/**
 * 构建聚合表查询路径
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param jobId 作业ID
 */
export function buildAggQueryPath(
  userId: string,
  platform: string,
  year: number,
  month: number,
  jobId?: string
): string {
  if (jobId) {
    return path.join(AGG_DIR, `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/job_id=${jobId}/agg_month_sku.parquet`);
  } else {
    return path.join(AGG_DIR, `user_id=${userId}/platform=${platform}/year=${year}/month=${month}/*/agg_month_sku.parquet`);
  }
}