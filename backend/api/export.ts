/**
 * 数据导出 API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import {
  queryFactData,
  queryAggData,
} from '../lib/duckdb';
import { exportToExcel, uploadExcelToStorage } from '../lib/xlsx';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import { generateId, apiSuccess, apiError, validatePlatform } from '../lib/utils';

/**
 * 处理数据导出请求
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

    // 生成导出 ID
    const exportId = generateId('export_');

    // 生成文件名
    const fileName = `${validatedPlatform}_${year}_${month}${sku ? `_${sku}` : ''}_${validatedView}.xlsx`;

    // 获取数据（全量）
    let rows: any[] = [];
    if (validatedView === 'fact') {
      // 查询行级数据（获取全部）
      rows = await queryFactData(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
        100000, // 限制最大导出数量
        0,
      );
    } else {
      // 查询聚合数据（获取全部）
      rows = await queryAggData(
        validatedPlatform,
        Number(year),
        Number(month),
        sku as string,
        100000, // 限制最大导出数量
        0,
      );
    }

    // 处理行，移除内部字段
    rows = rows.map(row => {
      const { id, job_id, upload_id, created_at, ...rest } = row;
      return rest;
    });

    // 确定输出路径
    const exportDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportDir, { recursive: true });

    // 导出到 Excel 文件
    const filePath = await exportToExcel(rows, {
      sheetName: validatedView === 'fact' ? 'Row Level Data' : 'Summary Data',
      fileName: fileName,
      dirPath: exportDir,
    });

    // 根据存储驱动类型处理
    const storageDriver = config().storage.driver;

    if (storageDriver === 'local') {
      // 本地模式：发送文件
      const fileData = await fs.readFile(filePath);

      // 设置响应头
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // 发送文件
      res.status(200).send(fileData);
    } else {
      // 云存储模式：上传文件并返回签名 URL
      const objectKey = `exports/${validatedPlatform}/${year}/${month}/${exportId}/${fileName}`;

      // 上传到存储
      const downloadUrl = await uploadExcelToStorage(filePath, objectKey);

      // 返回下载链接
      return res.status(200).json(apiSuccess({
        exportId,
        downloadUrl,
        fileName,
        expiresIn: config().signedUrlExpiry,
      }));
    }
  } catch (err) {
    console.error('Error exporting data:', err);
    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}