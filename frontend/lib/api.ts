import type {
  DataRow,
  FactRow,
  AggRow,
  ProcessRequest,
  PreviewRequest,
  UploadFileType,
  UploadResult,
  UploadResultsMap,
  Platform,
} from "./types"

import { getUserId } from './client-utils';

/**
 * 创建带有标准头部的请求选项
 * @param options 原始请求选项
 * @returns 更新后的请求选项
 */
function createRequestOptions(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  headers.set('x-user-id', getUserId());

  return {
    ...options,
    headers
  };
}

/**
 * Simulate network delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload files to server (mock)
 */
export async function uploadFiles(formData: FormData): Promise<UploadResultsMap> {
  try {
    const response = await fetch('/api/upload', createRequestOptions({
      method: 'POST',
      body: formData
    }));

    if (!response.ok) {
      throw new Error(`上传失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const payload = Array.isArray(data?.files) ? data.files : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    const results: UploadResultsMap = {};
    for (const item of payload) {
      if (!item?.fileType || !item?.uploadId) {
        continue;
      }
      const key = item.fileType as UploadFileType;
      results[key] = {
        uploadId: item.uploadId,
        contentHash: item.contentHash,
        isDuplicateFile: Boolean(item.isDuplicateFile),
        fileType: key,
        originalFilename: item.originalFilename,
      };
    }

    return results;
  } catch (error) {
    console.error('上传文件错误:', error);
    throw error;
  }
}

/**
 * Process uploaded data (mock)
 */
export async function processData(request: ProcessRequest): Promise<{ jobId?: string; status: string; message: string; datasetId?: string; factCount?: number; aggCount?: number; }>{
  try {
    const response = await fetch('/api/process', createRequestOptions({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    }));

    if (!response.ok) {
      throw new Error(`处理失败: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const payload = data?.data ?? {};
    return {
      jobId: payload.jobId,
      status: payload.status,
      message: payload.message,
      datasetId: payload.datasetId,
      factCount: payload.factCount,
      aggCount: payload.aggCount,
    };
  } catch (error) {
    console.error('处理数据错误:', error);
    throw error;
  }
}

// 清空历史数据
export type ClearSettlementRequest = {
  platform: Platform
  year: number
  month: number
}

export async function clearSettlement(req: ClearSettlementRequest): Promise<{ status: string; datasetId: string; jobIds: string[] }>{
  try {
    const response = await fetch('/api/clear-settlement', createRequestOptions({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req)
    }));

    if (!response.ok) {
      let message = '清空失败';
      try {
        const data = await response.json();
        if (data?.message) message = data.message;
      } catch {}
      throw new Error(message);
    }
    return response.json();
  } catch (error) {
    console.error('清空数据错误:', error);
    throw error;
  }
}

/**
 * Generate mock data row
 */
function generateMockRow(index: number): DataRow {
  const qtySold = Math.floor(Math.random() * 500) + 10
  const avgPrice = Math.random() * 200 + 50
  const recvCustomer = qtySold * avgPrice
  const recvPlatform = recvCustomer * (0.85 + Math.random() * 0.1)
  const extraCharge = Math.random() * 100
  const platformComm = recvCustomer * (0.05 + Math.random() * 0.05)
  const affiliate = recvCustomer * (0.02 + Math.random() * 0.03)
  const other = Math.random() * 50
  const netReceived = recvPlatform + extraCharge - platformComm - affiliate - other

  return {
    internal_sku: `SKU-${String(index + 1).padStart(6, "0")}`,
    qty_sold: qtySold,
    sum_recv_customer: Number.parseFloat(recvCustomer.toFixed(2)),
    sum_recv_platform: Number.parseFloat(recvPlatform.toFixed(2)),
    sum_extra_charge: Number.parseFloat(extraCharge.toFixed(2)),
    sum_fee_platform_comm: Number.parseFloat(platformComm.toFixed(2)),
    sum_fee_affiliate: Number.parseFloat(affiliate.toFixed(2)),
    sum_fee_other: Number.parseFloat(other.toFixed(2)),
    sum_net_received: Number.parseFloat(netReceived.toFixed(2)),
  }
}

/**
 * Generate mock fact row
 */
function generateMockFactRow(index: number, platform: string, year: number, month: number): FactRow {
  const qtySold = Math.floor(Math.random() * 50) + 1
  const avgPrice = Math.random() * 200 + 50
  const recvCustomer = qtySold * avgPrice
  const recvPlatform = recvCustomer * (0.85 + Math.random() * 0.1)
  const extraCharge = Math.random() * 100
  const platformComm = recvCustomer * (0.05 + Math.random() * 0.05)
  const affiliate = recvCustomer * (0.02 + Math.random() * 0.03)
  const other = Math.random() * 50
  const netReceived = recvPlatform + extraCharge - platformComm - affiliate - other

  // line_count and line_no are only for wechat_video
  const hasLineInfo = platform === "wechat_video"

  return {
    year,
    month,
    order_id: `ORD-${year}${String(month).padStart(2, "0")}-${String(index + 1).padStart(8, "0")}`,
    line_count: hasLineInfo ? Math.floor(Math.random() * 5) + 1 : null,
    line_no: hasLineInfo ? Math.floor(Math.random() * 5) + 1 : null,
    internal_sku: `SKU-${String(Math.floor(Math.random() * 1000) + 1).padStart(6, "0")}`,
    fin_code: `FIN-${String(Math.floor(Math.random() * 100) + 1).padStart(4, "0")}`,
    qty_sold: qtySold,
    recv_customer: Number.parseFloat(recvCustomer.toFixed(2)),
    recv_platform: Number.parseFloat(recvPlatform.toFixed(2)),
    extra_charge: Number.parseFloat(extraCharge.toFixed(2)),
    fee_platform_comm: Number.parseFloat(platformComm.toFixed(2)),
    fee_affiliate: Number.parseFloat(affiliate.toFixed(2)),
    fee_other: Number.parseFloat(other.toFixed(2)),
    net_received: Number.parseFloat(netReceived.toFixed(2)),
  }
}

/**
 * Fetch aggregated data (mock) - New 6-column format
 * Aggregates by internal_sku × year × month
 */
export async function fetchAgg(request: PreviewRequest): Promise<{ rows: AggRow[] }> {
  try {
    const url = new URL('/api/preview', window.location.origin);
    url.searchParams.set('platform', request.platform);
    url.searchParams.set('year', String(request.year));
    url.searchParams.set('month', String(request.month));
    url.searchParams.set('view', 'agg');

    if (request.sku) {
      url.searchParams.set('sku', request.sku);
    }

    const response = await fetch(url, createRequestOptions());

    if (!response.ok) {
      throw new Error(`获取聚合数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const payload = data?.data ?? {};
    const rows: AggRow[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? (payload as AggRow[])
        : Array.isArray(data)
          ? (data as AggRow[])
          : [];
    return { rows };
  } catch (error) {
    console.error('获取聚合数据错误:', error);
    // 回退到模拟数据
    await delay(400 + Math.random() * 400);

    const factRowCount = Math.floor(Math.random() * 200) + 100;
    const factRows = Array.from({ length: factRowCount }, (_, i) =>
      generateMockFactRow(i, request.platform, request.year, request.month),
    );

    // Filter by SKU if provided
    const filteredRows = request.sku
      ? factRows.filter((row) => row.internal_sku.toLowerCase().includes(request.sku!.toLowerCase()))
      : factRows;

    // Aggregate by internal_sku
    const aggMap = new Map<string, AggRow>();

    for (const row of filteredRows) {
      const existing = aggMap.get(row.internal_sku);

      if (existing) {
        existing.qty_sold_sum += row.qty_sold;
        existing.income_total_sum += row.recv_customer + row.recv_platform + row.extra_charge;
        existing.fee_platform_comm_sum += row.fee_platform_comm;
        existing.fee_other_sum += row.fee_affiliate + row.fee_other;
        existing.net_received_sum += row.net_received;
      } else {
        aggMap.set(row.internal_sku, {
          internal_sku: row.internal_sku,
          qty_sold_sum: row.qty_sold,
          income_total_sum: row.recv_customer + row.recv_platform + row.extra_charge,
          fee_platform_comm_sum: row.fee_platform_comm,
          fee_other_sum: row.fee_affiliate + row.fee_other,
          net_received_sum: row.net_received,
        });
      }
    }

    // Convert to array and round values
    const rows = Array.from(aggMap.values()).map((row) => ({
      ...row,
      qty_sold_sum: Math.round(row.qty_sold_sum),
      income_total_sum: Number.parseFloat(row.income_total_sum.toFixed(2)),
      fee_platform_comm_sum: Number.parseFloat(row.fee_platform_comm_sum.toFixed(2)),
      fee_other_sum: Number.parseFloat(row.fee_other_sum.toFixed(2)),
      net_received_sum: Number.parseFloat(row.net_received_sum.toFixed(2)),
    }));

    return { rows };
  }
}

/**
 * Fetch fact data (mock)
 */
export async function fetchFact(request: PreviewRequest): Promise<{ rows: FactRow[] }> {
  try {
    const url = new URL('/api/preview', window.location.origin);
    url.searchParams.set('platform', request.platform);
    url.searchParams.set('year', String(request.year));
    url.searchParams.set('month', String(request.month));
    url.searchParams.set('view', 'fact');

    // 为行级预览显式关闭分页：默认一次性取足够多的行，保证汇总与导出一致
    const page = request.page ?? 1;
    const pageSize = request.pageSize ?? 10000;
    url.searchParams.set('page', String(page));
    url.searchParams.set('pageSize', String(pageSize));

    if (request.sku) {
      url.searchParams.set('sku', request.sku);
    }

    const response = await fetch(url, createRequestOptions());

    if (!response.ok) {
      throw new Error(`获取行级数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const payload = data?.data ?? {};
    const rows: FactRow[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? (payload as FactRow[])
        : Array.isArray(data)
          ? (data as FactRow[])
          : [];
    return { rows };
  } catch (error) {
    console.error('获取行级数据错误:', error);
    // 回退到模拟数据
    await delay(400 + Math.random() * 400);

    const rowCount = Math.floor(Math.random() * 200) + 100; // 100-300 rows
    let rows = Array.from({ length: rowCount }, (_, i) =>
      generateMockFactRow(i, request.platform, request.year, request.month),
    );

    // Filter by SKU if provided
    if (request.sku) {
      rows = rows.filter((row) => row.internal_sku.toLowerCase().includes(request.sku!.toLowerCase()));
    }

    return { rows };
  }
}

/**
 * 导出Excel文件
 * 使用fetch + Blob下载方式
 */
export async function exportXlsx(params: {
  platform: string
  year: number
  month: number
  view?: "fact" | "agg"
  fileName?: string
  jobId?: string
}): Promise<void> {
  try {
    const url = new URL('/api/export', window.location.origin);
    url.searchParams.set('platform', params.platform);
    url.searchParams.set('year', String(params.year));
    url.searchParams.set('month', String(params.month));

    if (params.view) {
      url.searchParams.set('view', params.view);
    }

    if (params.jobId) {
      url.searchParams.set('jobId', params.jobId);
    }

    // 添加format参数
    url.searchParams.set('format', 'xlsx');

    const response = await fetch(url, createRequestOptions());

    if (!response.ok) {
      throw new Error(`导出失败: ${response.status} ${response.statusText}`);
    }

    // 获取文件blob
    const blob = await response.blob();

    // 创建下载链接
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;

    // 设置文件名
    const fileName = params.fileName ||
      `${params.platform}_${params.year}_${params.month}_${params.view || 'fact'}.xlsx`;
    a.download = fileName;

    // 模拟点击下载
    document.body.appendChild(a);
    a.click();

    // 清理
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('导出Excel错误:', error);
    alert('导出Excel失败，请稍后重试');
  }
}

/**
 * 生成导出URL (已弃用，请使用exportXlsx)
 * @deprecated 请使用exportXlsx函数替代
 */
export function exportXlsxUrl(params: {
  platform: string
  year: number
  month: number
  view?: "fact" | "agg"
}): string {
  console.warn('exportXlsxUrl已弃用，请使用exportXlsx函数');

  const searchParams = new URLSearchParams({
    platform: params.platform,
    year: String(params.year),
    month: String(params.month),
  });

  if (params.view) {
    searchParams.set("view", params.view);
  }

  return `/api/export?${searchParams.toString()}`;
}

export const fetchPreview = fetchFact;
