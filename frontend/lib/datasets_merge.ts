/**
 * 数据集合并工具
 * 用于实现merge模式下的数据合并功能
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Dataset, DatasetRow, getDataset, getDatasetRows, addDatasetRow, generateRowKey, generateRowHash } from './datasets';
import { FactRow } from './types';

/**
 * 合并数据集行
 * @param datasetId 目标数据集ID
 * @param uploadId 上传ID
 * @param rows 行数组
 * @returns 合并统计结果
 */
export async function mergeDatasetRows(
  datasetId: string,
  uploadId: string,
  rows: { rowKey: string, rowHash: string }[]
): Promise<{
  inserted: number,
  updated: number,
  unchanged: number,
  warnings: string[]
}> {
  // 获取目标数据集
  const dataset = await getDataset(datasetId);
  if (!dataset) {
    throw new Error(`找不到数据集: ${datasetId}`);
  }

  // 获取现有行
  const existingRows = await getDatasetRows(datasetId);

  // 构建行键索引
  const rowKeyMap = new Map<string, DatasetRow>();
  for (const row of existingRows) {
    rowKeyMap.set(row.rowKey, row);
  }

  // 合并统计
  const stats = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    warnings: [] as string[]
  };

  // 处理每一行
  for (const row of rows) {
    const existing = rowKeyMap.get(row.rowKey);

    if (!existing) {
      // 新行，插入
      await addDatasetRow(datasetId, uploadId, row.rowKey, row.rowHash);
      stats.inserted++;
    } else if (existing.rowHash !== row.rowHash) {
      // 已存在但内容变更，更新
      // 删除旧行
      const updatedRows = existingRows.filter(r => r.rowKey !== row.rowKey);

      // 添加新行
      await addDatasetRow(datasetId, uploadId, row.rowKey, row.rowHash);
      stats.updated++;
    } else {
      // 已存在且内容未变
      stats.unchanged++;
    }
  }

  return stats;
}

/**
 * 验证行是否已存在
 * @param datasetId 数据集ID
 * @param rowKey 行键
 * @param rowHash 行哈希
 * @returns 是否匹配
 */
export async function validateRowExists(
  datasetId: string,
  rowKey: string,
  rowHash: string
): Promise<boolean> {
  const rows = await getDatasetRows(datasetId);
  const existing = rows.find(row => row.rowKey === rowKey);

  // 检查是否存在且哈希匹配
  return !!existing && existing.rowHash === rowHash;
}

/**
 * 合并事实表行数据
 * @param rows 事实表行数组
 * @returns 合并后的行
 */
export function mergeFactRows(rows: FactRow[]): FactRow[] {
  // 使用Map按行键分组
  const rowsByKey = new Map<string, FactRow[]>();

  // 按行键分组
  for (const row of rows) {
    const key = row.row_key || generateRowKey(
      row.platform || '',
      row.order_id || '',
      row.internal_sku || '',
      row.line_no
    );

    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, []);
    }
    rowsByKey.get(key)?.push(row);
  }

  const mergedRows: FactRow[] = [];

  // 对每组行进行合并
  for (const [key, groupRows] of rowsByKey.entries()) {
    // 如果只有一行，直接添加
    if (groupRows.length === 1) {
      mergedRows.push(groupRows[0]);
      continue;
    }

    // 合并多行
    const mergedRow = mergeRows(groupRows);

    // 生成行哈希
    const hashData = {
      order_id: mergedRow.order_id,
      internal_sku: mergedRow.internal_sku,
      line_no: mergedRow.line_no,
      qty_sold: mergedRow.qty_sold,
      recv_customer: mergedRow.recv_customer,
      recv_platform: mergedRow.recv_platform,
      extra_charge: mergedRow.extra_charge,
      fee_platform_comm: mergedRow.fee_platform_comm,
      fee_affiliate: mergedRow.fee_affiliate,
      fee_other: mergedRow.fee_other,
      net_received: mergedRow.net_received
    };

    mergedRow.row_hash = generateRowHash(hashData);
    mergedRows.push(mergedRow);
  }

  return mergedRows;
}

/**
 * 合并多行数据
 * 规则：
 * 1. 保留第一行的基本信息（订单号、SKU等）
 * 2. 数量字段: 按最大值取值
 * 3. 金额字段: 按总和取值
 * @param rows 待合并的行
 * @returns 合并后的行
 */
function mergeRows(rows: FactRow[]): FactRow {
  // 创建基础行
  const base = { ...rows[0] };

  // 数量取最大值（应对退款等场景）
  let maxQty = base.qty_sold || 0;
  for (let i = 1; i < rows.length; i++) {
    const qty = rows[i].qty_sold || 0;
    if (qty > maxQty) {
      maxQty = qty;
    }
  }
  base.qty_sold = maxQty;

  // 金额字段取总和
  base.recv_customer = sumField(rows, 'recv_customer');
  base.recv_platform = sumField(rows, 'recv_platform');
  base.extra_charge = sumField(rows, 'extra_charge');
  base.fee_platform_comm = sumField(rows, 'fee_platform_comm');
  base.fee_affiliate = sumField(rows, 'fee_affiliate');
  base.fee_other = sumField(rows, 'fee_other');

  // 重新计算net_received
  base.net_received =
    (base.recv_customer || 0) +
    (base.recv_platform || 0) +
    (base.extra_charge || 0) -
    (base.fee_platform_comm || 0) -
    (base.fee_affiliate || 0) -
    (base.fee_other || 0);

  // 记录来源
  base.source_merge_count = rows.length;

  return base;
}

/**
 * 对字段求和
 * @param rows 行数组
 * @param field 字段名
 * @returns 字段总和
 */
function sumField(rows: FactRow[], field: keyof FactRow): number {
  let sum = 0;
  for (const row of rows) {
    if (typeof row[field] === 'number') {
      sum += row[field] as number;
    }
  }
  return sum;
}
