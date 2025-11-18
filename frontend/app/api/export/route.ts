/**
 * 导出API - 导出数据为CSV或XLSX
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPath, readFileSafe, writeFileSafe, ensureDir, getErrorResponse, validatePlatform, getRequestId } from '@/lib/server-utils';
import { promises as fs } from 'node:fs';
import * as XLSX from 'xlsx';

import { storage } from '@/lib/storage';
import { config } from '@/lib/config';
import { queryAggData, countAggRows } from '@/lib/duckdb';
import { resolveUserId } from '@/lib/user';
import nodePathModule from 'node:path';
import { getEffectiveDataset } from '@/lib/datasets';
import { previewFactQuery, previewFactQueryForJobs } from '@/lib/duckdb-preview';

// 导出目录
const EXPORTS_DIR = nodePathModule.join(process.cwd(), 'data', 'exports');

// 行级（fact）导出表头（15 列，固定顺序）
export const FACT_ROW_HEADER = [
  '年',
  '月',
  '订单号',
  '订单行数',
  '订单序位',
  '平台商品编码',
  '商品编码',
  '销售数量',
  '应收客户',
  '应收平台',
  '价外收费',
  '扣平台佣金用',
  '扣分销佣金',
  '扣其它费用',
  '应到账金额',
] as const;

// 行级导出所需字段（与 rows 字段名一一对应）
type FactRowForExport = {
  order_id: string;
  line_count: number | null | undefined;
  line_no: number | null | undefined;
  internal_sku: string | null | undefined; // 平台商品编码（平台SKU）
  fin_code: string | null | undefined;     // 商品编码（财务/内部编码）
  qty_sold: number | null | undefined;
  recv_customer: number | null | undefined;
  recv_platform: number | null | undefined;
  extra_charge: number | null | undefined;
  fee_platform_comm: number | null | undefined;
  fee_affiliate: number | null | undefined;
  fee_other: number | null | undefined;
  net_received: number | null | undefined;
};

// 将 rows 构造成 AoA，并进行基础自检（长度/必备列）
function buildFactAoA(
  yearNum: number,
  monthNum: number,
  rows: FactRowForExport[],
): (string | number)[][] {
  const EXPECTED_COLUMNS = FACT_ROW_HEADER.length;
  if (EXPECTED_COLUMNS !== 15) {
    throw new Error(`[export] FACT_ROW_HEADER length=${EXPECTED_COLUMNS}, expected 15`);
  }

  const aoa: (string | number)[][] = [FACT_ROW_HEADER as unknown as (string | number)[]];

  rows.forEach((r, index) => {
    const line: (string | number)[] = [
      yearNum,
      monthNum,
      r.order_id,
      r.line_count ?? 0,
      r.line_no ?? 0,
      r.internal_sku ?? '', // 平台商品编码（平台SKU）
      r.fin_code ?? '',     // 商品编码（财务/内部编码）
      r.qty_sold ?? 0,
      r.recv_customer ?? 0,
      r.recv_platform ?? 0,
      r.extra_charge ?? 0,
      r.fee_platform_comm ?? 0,
      r.fee_affiliate ?? 0,
      r.fee_other ?? 0,
      r.net_received ?? 0,
    ];

    if (line.length !== EXPECTED_COLUMNS) {
      throw new Error(`[export] fact row length mismatch at index=${index}, got=${line.length}, expected=${EXPECTED_COLUMNS}`);
    }

    aoa.push(line);
  });

  return aoa;
}

/**
 * 导出为Excel文件
 * @param data 数据
 * @param filePath 文件路径
 * @param sheetName 工作表名称
 */
async function exportToExcel(data: any[], filePath: string, sheetName: string, header?: string[]): Promise<void> {
  // 创建工作簿
  const workbook = XLSX.utils.book_new();

  // 创建工作表
  const worksheet = header
    ? XLSX.utils.json_to_sheet(data, { header })
    : XLSX.utils.json_to_sheet(data);

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
async function exportToCsv(data: any[], filePath: string, headerOrder?: string[]): Promise<void> {
  // 获取列名
  const columns = headerOrder && headerOrder.length > 0
    ? headerOrder
    : Object.keys(data[0] || {});

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
    // 从请求中解析用户ID
    const userId = resolveUserId(req);
    // 获取请求ID，直接使用同步版本
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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
      return NextResponse.json(
        {
          request_id: requestId,
          message: '平台参数缺失'
        },
        { status: 400 }
      );
    }

    // 验证年份
    if (!year || isNaN(parseInt(year, 10))) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '年份参数无效'
        },
        { status: 400 }
      );
    }

    // 验证月份
    const monthNum = parseInt(month || '', 10);
    if (!month || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '月份参数无效，应在1-12之间'
        },
        { status: 400 }
      );
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      // 验证平台名
      const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];
      const normalized = platform.toLowerCase().trim();

      if (!validPlatforms.includes(normalized)) {
        throw new Error(`不支持的平台: ${platform}。支持的平台: ${validPlatforms.join(', ')}`);
      }

      validatedPlatform = normalized;
    } catch (err) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: err instanceof Error ? err.message : "验证平台失败",
        },
        { status: 400 }
      );
    }

    // 验证视图类型
    if (view !== 'fact' && view !== 'agg') {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '视图类型无效，应为fact或agg',
        },
        { status: 400 }
      );
    }

    // 验证格式
    if (format !== 'csv' && format !== 'xlsx') {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '导出格式无效，应为csv或xlsx',
        },
        { status: 400 }
      );
    }

    // 创建导出目录
    await ensureDir(EXPORTS_DIR);

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${validatedPlatform}_${year}_${month}${sku ? `_${sku}` : ''}_${view}.${format}`;
    const filePath = nodePathModule.join(EXPORTS_DIR, `${timestamp}_${fileName}`);

    const dataset = await getEffectiveDataset(
      userId,
      validatedPlatform,
      parseInt(year, 10),
      monthNum
    );

    console.log('[export] dataset', dataset ? {
      id: dataset.id,
      metadata: dataset.metadata,
      effectiveUploadId: dataset.effectiveUploadId
    } : null);
    console.log('[export-debug] dataset', {
      datasetId: dataset?.id,
      status: dataset?.status,
      metadata: dataset?.metadata,
    });

    if (!dataset) {
      const message = '未找到有效数据集，请先完成处理流程';
      console.warn('[export] dataset not found', {
        userId,
        platform: validatedPlatform,
        year,
        month,
      });
      return NextResponse.json(
        {
          request_id: requestId,
          message
        },
        { status: 404 }
      );
    }

    const jobIds = dataset.metadata?.jobIds;
    const queryJobId = url.searchParams.get('jobId') || undefined;
    const lastJobId = queryJobId
      ? queryJobId
      : (Array.isArray(jobIds) && jobIds.length > 0 ? jobIds[jobIds.length - 1] : undefined);

    // 获取数据（全量），确保从Parquet有效视图中读取
    let data: any[] = [];
    if (view === 'fact') {
      try {
        // 与预览保持同源：使用 previewFactQuery + dataset.metadata.jobIds（所有 job）
        const rows = await previewFactQuery(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          dataset?.metadata?.jobIds,
          userId!,
          sku,
          Number.MAX_SAFE_INTEGER,
          0
        );
        const searchParams = new URL(req.url).searchParams;

        // Sanity 日志：确认 rows 数量与关键行字段（写 AOA 之前）
        try {
          console.log('[export] fact-row sanity', {
            rowsCount: rows.length,
            orderIdsSample: rows.slice(0, 5).map((r: any) => r.order_id),
            lineInfoSample: rows.slice(0, 5).map((r: any) => ({ id: r.order_id, line_count: r.line_count, line_no: r.line_no })),
          });
        } catch {}

        // 固定表头与顺序由 FACT_ROW_HEADER 统一管理
        const yearNum = Number(searchParams.get('year'));
        const monthNumParam = Number(searchParams.get('month'));
        if (!yearNum || !monthNumParam) {
          console.error('[export] invalid year/month params', { yearNum, monthNumParam });
          throw new Error('导出缺少 year 或 month 参数');
        }

        // 诊断：导出时的数据概况与 dataset 一致性
        try {
          const jobIdsFromMetadata = Array.isArray(dataset?.metadata?.jobIds)
            ? dataset?.metadata?.jobIds
            : (dataset?.metadata?.jobId ? [dataset?.metadata?.jobId] : [])
          console.log('[export-debug] fact', {
            platform: validatedPlatform,
            year: yearNum,
            month: monthNumParam,
            datasetId: dataset?.id,
            jobIdsFromMetadata,
            rowsCountFromDuckdb: rows.length,
            factCountFromMetadata: dataset?.metadata?.factCount,
          })
        } catch {}

        // 仅在 xlsx 格式且为行级 fact 时，用固定 HEADER + 数组的方式写入工作表
        if (format === 'xlsx') {
          const aoa = buildFactAoA(yearNum, monthNumParam, rows as any as FactRowForExport[]);

          const workbook = XLSX.utils.book_new();
          const worksheet = XLSX.utils.aoa_to_sheet(aoa);
          XLSX.utils.book_append_sheet(workbook, worksheet, 'fact_rows');

          // 概要日志（收紧日志，仅一条）
          console.log('[export] fact-row xlsx', { year: yearNum, month: monthNumParam, rowsCount: rows.length });

          const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
          await fs.writeFile(filePath, buffer);
        }

        // 供后续 CSV 使用的数据副本（不用于 xlsx 覆盖写入）
        data = rows;
      } catch (err) {
        console.error('查询事实表数据失败:', err);
        throw new Error(`查询事实表数据失败: ${err.message}`);
      }
    } else {
      try {
        const totalCount = await countAggRows(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          userId!,
          sku,
          jobIds
        );

        if (totalCount === 0) {
          console.warn(`未找到聚合表数据: ${userId}/${validatedPlatform}/${year}/${month}`);
          data = [];
        } else {
          data = await queryAggData(
            validatedPlatform,
            parseInt(year, 10),
            monthNum,
            sku,
            totalCount,
            0,
            userId,
            jobIds
          );
        }
      } catch (err) {
        console.error('查询聚合表数据失败:', err);
        throw new Error(`查询聚合表数据失败: ${err.message}`);
      }
    }

    // 处理行，移除内部字段与不需要的元数据；并保证 year/month 回填为查询参数（用于 CSV 或非 fact 视图）
    data = data.map(row => {
      const { id, user_id, job_id, upload_id, created_at, updated_at, row_key, row_hash,
        rule_version, validation_status, validation_warnings, source_row,
        platform: _platform, source_file: _source_file, source_line: _source_line,
        ...rest } = row as any;
      if (rest.year === undefined || rest.year === null || rest.year === 0) rest.year = parseInt(year!, 10);
      if (rest.month === undefined || rest.month === null || rest.month === 0) rest.month = monthNum;
      return rest;
    });

    // 强制列头（仅 fact 视图）：A–O 15 列（中文表头），避免首行缺键导致整列缺失
    // 复用顶部 FACT_ROW_HEADER（TODO：CSV 分支可进一步复用同一字段映射）

    let dataForExport = data;
    if (view === 'fact') {
      // 先回填 year/month；再映射为中文列名
      const filled = data.map((row: any) => {
        const r = { ...row };
        if (r.year === undefined || r.year === null || r.year === 0) r.year = parseInt(year!, 10);
        if (r.month === undefined || r.month === null || r.month === 0) r.month = monthNum;
        return r;
      });

      dataForExport = filled.map((r: any) => ({
        '年': r.year ?? '',
        '月': r.month ?? '',
        '订单号': r.order_id ?? '',
        '订单行数': r.line_count ?? 0,
        '订单序位': r.line_no ?? 0,
        '平台商品编码': r.internal_sku ?? '',
        '商品编码': r.fin_code ?? '',
        '销售数量': r.qty_sold ?? 0,
        '应收客户': r.recv_customer ?? 0,
        '应收平台': r.recv_platform ?? 0,
        '价外收费': r.extra_charge ?? 0,
        '扣平台佣金用': r.fee_platform_comm ?? 0,
        '扣分销佣金': r.fee_affiliate ?? 0,
        '扣其它费用': r.fee_other ?? 0,
        '应到账金额': r.net_received ?? 0,
      }));
    }

    if (format !== 'xlsx') {
      await exportToCsv(
        dataForExport,
        filePath,
        view === 'fact' ? FACT_ROW_HEADER : undefined
      );
    } else {
      // xlsx 情况：
      // - 行级 fact 已在上面的专属分支写入（固定 HEADER + 数组），此处不再重复写入覆盖
      // - 汇总视图（agg）使用固定表头 + 数组写入，仅一个工作表 agg_rows
      if (view !== 'fact') {
        const AGG_ROW_HEADER = [
          '商品编码',            // internal_sku
          '销售数量合计',        // qty_sold_sum
          '收入总计',            // income_total_sum
          '平台佣金合计',        // fee_platform_comm_sum
          '其他费用合计',        // fee_other_sum
          '应到账金额合计',      // net_received_sum
        ];

        const workbook = XLSX.utils.book_new();
        // 以 header:1 构造 AOA，避免推断列名
        const aoa: any[] = [AGG_ROW_HEADER];
        for (const r of data as any[]) {
          const line = [
            r.internal_sku ?? '',
            r.qty_sold_sum ?? 0,
            r.income_total_sum ?? 0,
            r.fee_platform_comm_sum ?? 0,
            r.fee_other_sum ?? 0,
            r.net_received_sum ?? 0,
          ];
          aoa.push(line);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'agg_rows');

        // 概要日志（收紧日志，仅一条）
        console.log('[export] agg-row xlsx', { year: Number(year), month: monthNum, rowsCount: (data as any[]).length });

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        await fs.writeFile(filePath, buffer);
      }
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
    const errRequestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return NextResponse.json({
      request_id: errRequestId,
      message: '导出数据时发生错误'
    }, {
      status: 500
    });
  }
}
