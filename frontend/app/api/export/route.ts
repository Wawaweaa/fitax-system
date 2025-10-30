/**
 * 导出API - 导出数据为CSV或XLSX
 */
import { NextRequest, NextResponse } from 'next/server';
import { path, readFileSafe, writeFileSafe, ensureDir } from '@/lib/server-utils';
import { promises as fs } from 'node:fs';
import * as XLSX from 'xlsx';
import { getErrorResponse, validatePlatform, getRequestId } from '@/lib/server-utils';
import { storage } from '@/lib/storage';
import { config } from '@/lib/config';
import { queryFactData, queryAggData } from '@/lib/duckdb';

// 导出目录
const EXPORTS_DIR = path.join(process.cwd(), 'data', 'exports');

/**
 * 导出为Excel文件
 * @param data 数据
 * @param filePath 文件路径
 * @param sheetName 工作表名称
 */
async function exportToExcel(data: any[], filePath: string, sheetName: string): Promise<void> {
  // 创建工作簿
  const workbook = XLSX.utils.book_new();

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(data);

  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 写入文件
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(filePath, buffer);
}

/**
 * 导出为CSV文件
 * @param data 数据
 * @param filePath 文件路径
 */
async function exportToCsv(data: any[], filePath: string): Promise<void> {
  // 获取列名
  const columns = Object.keys(data[0] || {});

  // 创建CSV标题行
  const header = columns.join(',');

  // 创建CSV数据行
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col];

      // 如果值包含逗号、双引号或换行符，需要加双引号并转义双引号
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      // 处理数值精度
      if (typeof value === 'number') {
        // 保留两位小数
        if (Number.isInteger(value)) {
          return value.toString();
        } else {
          return value.toFixed(2);
        }
      }

      return value === null || value === undefined ? '' : String(value);
    }).join(',');
  });

  // 合并标题和数据
  const csv = [header, ...rows].join('\n');

  // 写入文件
  await fs.writeFile(filePath, csv);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 从身份验证中获取用户ID (在真实环境中应从认证中间件获取)
    const userId = req.headers.get('x-user-id') || 'test-user-001';
    const requestId = await getRequestId(req.headers);

    // 检查是否为内联测试模式
    const isInlineTest = req.headers.get('x-test-inline') === '1';

    // 获取查询参数
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');
    const sku = url.searchParams.get('sku') || undefined;
    const view = url.searchParams.get('view') || 'fact';
    const format = url.searchParams.get('format') || 'xlsx';
    const inline = url.searchParams.get('inline') === '1' || isInlineTest;

    // 验证必要参数
    if (!platform) {
      return await getErrorResponse('平台参数缺失', 400, undefined, undefined, requestId);
    }

    // 验证年份
    if (!year || isNaN(parseInt(year, 10))) {
      return await getErrorResponse('年份参数无效', 400, undefined, undefined, requestId);
    }

    // 验证月份
    const monthNum = parseInt(month || '', 10);
    if (!month || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return await getErrorResponse('月份参数无效，应在1-12之间', 400, undefined, undefined, requestId);
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      validatedPlatform = await validatePlatform(platform);
    } catch (err) {
      return await getErrorResponse(err.message, 400, undefined, undefined, requestId);
    }

    // 验证视图类型
    if (view !== 'fact' && view !== 'agg') {
      return await getErrorResponse('视图类型无效，应为fact或agg', 400, undefined, undefined, requestId);
    }

    // 验证格式
    if (format !== 'csv' && format !== 'xlsx') {
      return await getErrorResponse('导出格式无效，应为csv或xlsx', 400, undefined, undefined, requestId);
    }

    // 创建导出目录
    await ensureDir(EXPORTS_DIR);

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${validatedPlatform}_${year}_${month}${sku ? `_${sku}` : ''}_${view}.${format}`;
    const filePath = path.join(EXPORTS_DIR, `${timestamp}_${fileName}`);

    // 获取数据（全量），确保从Parquet有效视图中读取
    let data: any[] = [];
    if (view === 'fact') {
      // 查询行级数据
      try {
        // 使用queryFactData从有效视图中读取数据
        data = await queryFactData(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          sku,
          100000, // 限制最大导出数量
          0,
          userId
        );

        // 如果数据为空，记录日志
        if (!data || data.length === 0) {
          console.warn(`未找到事实表数据: ${userId}/${validatedPlatform}/${year}/${month}`);
        }
      } catch (err) {
        console.error('查询事实表数据失败:', err);
        throw new Error(`查询事实表数据失败: ${err.message}`);
      }
    } else {
      // 查询聚合数据
      try {
        // 使用queryAggData从有效视图中读取数据
        data = await queryAggData(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          sku,
          100000, // 限制最大导出数量
          0,
          userId
        );

        // 如果数据为空，记录日志
        if (!data || data.length === 0) {
          console.warn(`未找到聚合表数据: ${userId}/${validatedPlatform}/${year}/${month}`);
        }
      } catch (err) {
        console.error('查询聚合表数据失败:', err);
        throw new Error(`查询聚合表数据失败: ${err.message}`);
      }
    }

    // 处理行，移除内部字段
    data = data.map(row => {
      // 创建新对象以避免修改原对象
      const { id, user_id, job_id, upload_id, created_at, updated_at, row_key, row_hash, ...rest } = row;
      return rest;
    });

    // 根据请求格式导出数据
    if (format === 'xlsx') {
      await exportToExcel(data, filePath, view === 'fact' ? '行级数据' : '汇总数据');
    } else {
      await exportToCsv(data, filePath);
    }

    // 处理内联响应 - 直接返回CSV内容
    if (inline && format === 'csv') {
      const fileContent = await fs.readFile(filePath, 'utf-8');

      const response = new NextResponse(fileContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${fileName}"`
        }
      });

      return response;
    }

    // 处理本地下载 - 返回文件或签名URL
    if (config().storage.driver === 'local') {
      // 读取文件内容
      const fileBuffer = await fs.readFile(filePath);

      // 设置响应头
      const contentType = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';

      const response = new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`
        }
      });

      return response;
    } else {
      // 云存储模式 - 上传到存储并返回签名URL
      const objectKey = `exports/user_id=${userId}/platform=${validatedPlatform}/year=${year}/month=${month}/timestamp=${timestamp}/${fileName}`;

      // 读取文件内容
      const fileBuffer = await fs.readFile(filePath);

      // 上传到存储
      await storage().putObject(objectKey, fileBuffer, {
        contentType: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv',
        metadata: {
          'user-id': userId,
          'platform': validatedPlatform,
          'year': year,
          'month': month
        }
      });

      // 获取签名URL
      const downloadUrl = await storage().getPresignedDownloadUrl(objectKey, {
        fileName,
        expiresIn: config().signedUrlExpiry
      });

      // 计算过期时间
      const expiresAt = new Date(Date.now() + config().signedUrlExpiry * 1000).toISOString();

      // 返回下载链接
      return NextResponse.json({
        request_id: requestId,
        data: {
          downloadUrl,
          expiresAt,
          fileName
        }
      }, {
        status: 200
      });
    }
  } catch (err) {
    console.error('导出数据错误:', err);
    return await getErrorResponse('导出数据时发生错误', 500);
  }
}
