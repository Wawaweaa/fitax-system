/**
 * 数据预览 API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import {
  queryFactData,
  queryAggData,
  getFactCount,
  getAggCount,
} from '../lib/duckdb';
import { config } from '../lib/config';
import { apiSuccess, apiError, validatePlatform } from '../lib/utils';

// 默认分页大小
const DEFAULT_PAGE_SIZE = 100;

/**
 * 处理数据预览请求
 * @param req 请求对象
 * @param res 响应对象
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method Not Allowed', 405));
  }

  try {
    // 获取查询参数
    const {
      platform,
      year,
      month,
      sku,
      view = 'fact',
      page = '1',
      pageSize = String(DEFAULT_PAGE_SIZE),
      sort,
    } = req.query;

    // 验证必要参数
    if (!platform) {
      return res.status(400).json(apiError('Platform is required', 400));
    }

    if (!year || isNaN(Number(year))) {
      return res.status(400).json(apiError('Valid year is required', 400));
    }

    if (!month || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json(apiError('Valid month (1-12) is required', 400));
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      validatedPlatform = validatePlatform(platform as string);
    } catch (err) {
      return res.status(400).json(apiError(err.message, 400));
    }

    // 验证视图类型
    const validatedView = (view as string) === 'agg' ? 'agg' : 'fact';

    // 计算分页
    const pageNumber = Math.max(1, parseInt(page as string, 10));
    const pageSizeNumber = Math.max(10, Math.min(1000, parseInt(pageSize as string, 10)));
    const offset = (pageNumber - 1) * pageSizeNumber;

    // 获取数据
    let rows: any[] = [];
    let totalCount: number = 0;

    if (validatedView === 'fact') {
      // 查询行级数据
      rows = await queryFactData(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
        pageSizeNumber,
        offset,
      );

      // 获取总数
      totalCount = await getFactCount(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
      );
    } else {
      // 查询聚合数据
      rows = await queryAggData(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
        pageSizeNumber,
        offset,
      );

      // 获取总数
      totalCount = await getAggCount(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
      );
    }

    // 处理行 ID 列
    rows = rows.map(row => {
      // 移除内部 ID 字段
      const { id, ...rest } = row;
      return rest;
    });

    // 返回数据
    return res.status(200).json(apiSuccess({
      platform: validatedPlatform,
      year: Number(year),
      month: Number(month),
      sku: sku || null,
      view: validatedView,
      page: pageNumber,
      pageSize: pageSizeNumber,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSizeNumber),
      rows,
    }));
  } catch (err) {
    console.error('Error fetching preview data:', err);
    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}