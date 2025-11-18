/**
 * 预览API - 查询有效视图数据
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuccessResponse, getErrorResponse, validatePlatform, getRequestId } from '@/lib/server-utils';
import { PreviewResponse, ViewType, FactRow, AggRow } from '@/lib/types';
import { getEffectiveDataset } from '@/lib/datasets';
import { queryAggData, countAggRows } from '@/lib/duckdb';
import { previewFactQuery } from '@/lib/duckdb-preview';
import { resolveUserId } from '@/lib/user';

/**
 * 计算事实表摘要
 * @param rows 事实表行
 * @returns 摘要信息
 */
function calculateFactSummary(rows: any[]): Record<string, any> {
  if (!rows || rows.length === 0) {
    return {};
  }

  // 初始化摘要数据
  const summary: Record<string, any> = {
    total_qty_sold: 0,
    total_recv_customer: 0,
    total_recv_platform: 0,
    total_extra_charge: 0,
    total_fee_platform_comm: 0,
    total_fee_affiliate: 0,
    total_fee_other: 0,
    total_net_received: 0,
  };

  // 遍历每行并累计各字段的值
  for (const row of rows) {
    summary.total_qty_sold += (row.qty_sold || 0);
    summary.total_recv_customer += (row.recv_customer || 0);
    summary.total_recv_platform += (row.recv_platform || 0);
    summary.total_extra_charge += (row.extra_charge || 0);
    summary.total_fee_platform_comm += (row.fee_platform_comm || 0);
    summary.total_fee_affiliate += (row.fee_affiliate || 0);
    summary.total_fee_other += (row.fee_other || 0);
    summary.total_net_received += (row.net_received || 0);
  }

  // 检查金额恒等式
  const calculatedNetReceived = summary.total_recv_customer +
                               summary.total_recv_platform +
                               summary.total_extra_charge -
                               summary.total_fee_platform_comm -
                               summary.total_fee_affiliate -
                               summary.total_fee_other;

  // 四舍五入到2位小数
  const roundedCalculatedNet = Math.round(calculatedNetReceived * 100) / 100;
  const roundedNetReceived = Math.round(summary.total_net_received * 100) / 100;

  // 检查金额差异
  const diff = Math.abs(roundedCalculatedNet - roundedNetReceived);
  if (diff > 0.02) {
    summary.consistency_check = false;
    summary.consistency_error = `金额不一致: 计算值=${roundedCalculatedNet}, 实际值=${roundedNetReceived}, 差异=${diff}`;
  } else {
    summary.consistency_check = true;
  }

  // 保留两位小数
  Object.keys(summary).forEach(key => {
    if (typeof summary[key] === 'number') {
      summary[key] = Math.round(summary[key] * 100) / 100;
    }
  });

  return summary;
}

/**
 * 计算聚合表摘要
 * @param rows 聚合表行
 * @returns 摘要信息
 */
function calculateAggSummary(rows: any[]): Record<string, any> {
  if (!rows || rows.length === 0) {
    return {};
  }

  // 初始化摘要数据
  const summary: Record<string, any> = {
    total_qty_sold_sum: 0,
    total_income_total_sum: 0,
    total_fee_platform_comm_sum: 0,
    total_fee_other_sum: 0,
    total_net_received_sum: 0,
    total_record_count: 0,
    sku_count: rows.length
  };

  // 遍历每行并累计各字段的值
  for (const row of rows) {
    summary.total_qty_sold_sum += (row.qty_sold_sum || 0);
    summary.total_income_total_sum += (row.income_total_sum || 0);
    summary.total_fee_platform_comm_sum += (row.fee_platform_comm_sum || 0);
    summary.total_fee_other_sum += (row.fee_other_sum || 0);
    summary.total_net_received_sum += (row.net_received_sum || 0);
    summary.total_record_count += (row.record_count || 0);
  }

  // 检查金额恒等式
  const calculatedNetReceived = summary.total_income_total_sum -
                               summary.total_fee_platform_comm_sum -
                               summary.total_fee_other_sum;

  // 四舍五入到2位小数
  const roundedCalculatedNet = Math.round(calculatedNetReceived * 100) / 100;
  const roundedNetReceived = Math.round(summary.total_net_received_sum * 100) / 100;

  // 检查金额差异
  const diff = Math.abs(roundedCalculatedNet - roundedNetReceived);
  if (diff > 0.02) {
    summary.consistency_check = false;
    summary.consistency_error = `金额不一致: 计算值=${roundedCalculatedNet}, 实际值=${roundedNetReceived}, 差异=${diff}`;
  } else {
    summary.consistency_check = true;
  }

  // 保留两位小数
  Object.keys(summary).forEach(key => {
    if (typeof summary[key] === 'number' && key !== 'total_record_count' && key !== 'sku_count') {
      summary[key] = Math.round(summary[key] * 100) / 100;
    }
  });

  return summary;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 从请求中解析用户ID
    const userId = resolveUserId(req);
    // 获取请求ID，直接使用同步版本
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    // 获取查询参数
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');
    const sku = url.searchParams.get('sku') || undefined;
    const viewParam = url.searchParams.get('view');
    const view: ViewType = viewParam === 'agg' || viewParam === 'summary' ? 'agg' : 'fact';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10);

    // 验证必要参数
    if (!platform) {
      return getErrorResponse('平台参数缺失', 400, undefined, undefined, requestId);
    }

    // 验证年份
    if (!year || isNaN(parseInt(year, 10))) {
      return getErrorResponse('年份参数无效', 400, undefined, undefined, requestId);
    }

    // 验证月份
    const monthNum = parseInt(month || '', 10);
    if (!month || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return getErrorResponse('月份参数无效，应在1-12之间', 400, undefined, undefined, requestId);
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      validatedPlatform = await validatePlatform(platform);
    } catch (err) {
      return getErrorResponse(err.message, 400, undefined, undefined, requestId);
    }

    // 验证视图类型
    if (view !== 'fact' && view !== 'agg') {
      return getErrorResponse('视图类型无效，应为fact或agg', 400, undefined, undefined, requestId);
    }

    console.log('[preview] 入参', {
      userId,
      platform,
      validatedPlatform,
      year,
      month,
      view,
      sku,
      page,
      pageSize
    });

    // 获取有效数据集
    const dataset = await getEffectiveDataset(
      userId,
      validatedPlatform,
      parseInt(year, 10),
      monthNum
    );

    console.log('[preview] dataset', {
      userId,
      platform: validatedPlatform,
      year: parseInt(year, 10),
      month: monthNum,
      datasetExists: Boolean(dataset),
      metadata: dataset?.metadata,
    });
    console.log('[preview-debug] dataset', {
      datasetExists: Boolean(dataset),
      datasetId: dataset?.id,
      status: dataset?.status,
      metadata: dataset?.metadata,
    });

    console.log('[preview] getEffectiveDataset', dataset ? {
      id: dataset.id,
      effectiveUploadId: dataset.effectiveUploadId,
      metadata: dataset.metadata
    } : null);

    if (!dataset) {
      return getSuccessResponse({
        data: [],
        pagination: {
          page,
          pageSize,
          total: 0
        },
        summary: {
          count: 0,
          warnings: []
        }
      }, requestId);
    }

    // 计算分页偏移
    const offset = (page - 1) * pageSize;

    // 根据视图类型查询数据，确保从Parquet有效视图中读取
    if (view === 'fact') {
      try {
        // 查询行级数据
        const rows = await previewFactQuery(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          dataset?.metadata?.jobIds,
          userId,
          sku,
          pageSize,
          offset
        );

        console.log('[preview] fact rows length', rows.length);

        // 诊断日志：不改动任何业务逻辑，仅打印当前返回给前端的行级数据概况
        try {
          console.log('[preview-debug] fact rows', {
            year,
            month: monthNum,
            rowsLength: rows.length,
            first5: (rows as any[]).slice(0, 5).map((r: any) => ({
              order_id: r.order_id,
              line_no: r.line_no,
              line_count: r.line_count,
              internal_sku: r.internal_sku,
              net_received: r.net_received,
            })),
          });
        } catch {}

        // 汇总日志：dataset/rows 对齐情况
        const jobIdsFromMetadata = Array.isArray(dataset?.metadata?.jobIds)
          ? dataset?.metadata?.jobIds
          : (dataset?.metadata?.jobId ? [dataset?.metadata?.jobId] : [])
        console.log('[preview-debug] final', {
          platform: validatedPlatform,
          year: parseInt(year, 10),
          month: monthNum,
          view,
          datasetId: dataset?.id,
          jobIdsFromMetadata,
          rowsLength: rows.length,
          factCountFromMetadata: dataset?.metadata?.factCount,
        });

        // 计算数据摘要
        const summary = calculateFactSummary(rows);

        const totalFromMetadata = dataset?.metadata?.factCount;
        const total = typeof totalFromMetadata === 'number' ? totalFromMetadata : rows.length;

        console.log('[preview] response pagination', {
          total,
          type: typeof total,
          rowsLength: rows.length,
          factCountFromMetadata: totalFromMetadata,
        });

        return getSuccessResponse({
          data: rows,
          pagination: {
            page,
            pageSize,
            total
          },
          summary: {
            count: total,
            ...summary,
            warnings: []
          }
        }, requestId);
      } catch (err) {
        console.error('查询事实表数据失败:', err);
        return getErrorResponse(`查询事实表数据失败: ${err.message}`, 500, undefined, undefined, requestId);
      }
    } else {
      try {
        // 查询聚合数据
        const rows = await queryAggData(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          sku,
          pageSize,
          offset,
          userId,
          dataset?.metadata?.jobIds
        );

        console.log('[preview] agg rows length', rows.length);

        // 获取总行数（仅用于分页）
        const totalCount = await countAggRows(
          validatedPlatform,
          parseInt(year, 10),
          monthNum,
          userId,
          sku,
          dataset?.metadata?.jobIds
        );

        console.log('[preview] agg total count', totalCount);

        // 计算数据摘要
        const summary = calculateAggSummary(rows);

        return getSuccessResponse({
          data: rows,
          pagination: {
            page,
            pageSize,
            total: totalCount
          },
          summary: {
            count: totalCount,
            ...summary,
            warnings: []
          }
        }, requestId);
      } catch (err) {
        console.error('查询聚合表数据失败:', err);
        return getErrorResponse(`查询聚合表数据失败: ${err.message}`, 500, undefined, undefined, requestId);
      }
    }
  } catch (err) {
    console.error('预览数据错误:', err);
    return getErrorResponse('获取预览数据时发生错误', 500);
  }
}
