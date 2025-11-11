/**
 * 数据集管理
 * 负责处理数据集的创建、更新和查询
 */
import fsSync from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config';
import { ensureDir } from './server-utils';

// 数据目录
const DATA_DIR = path.join(process.cwd(), 'data');
// 数据集记录文件
const DATASETS_FILE = path.join(DATA_DIR, 'datasets.json');
// 数据集行索引文件
const DATASET_ROWS_FILE = path.join(DATA_DIR, 'dataset_rows.json');

// 数据集状态类型
export type DatasetStatus = 'active' | 'superseded';

// 数据集信息接口
export interface Dataset {
  id: string;
  userId: string;
  platform: string;
  year: number;
  month: number;
  effectiveUploadId: string;
  status: DatasetStatus;
  createdAt: string;
  updatedAt: string;
  supersededAt?: string;
  supersededBy?: string;
  metadata?: Record<string, any>;
}

// 数据集行接口
export interface DatasetRow {
  datasetId: string;
  uploadId: string;
  rowKey: string;
  rowHash: string;
  createdAt: string;
  updatedAt: string;
}

// 数据集参数接口
export interface CreateDatasetParams {
  id: string;
  userId: string;
  platform: string;
  year: number;
  month: number;
  uploadId: string;
  metadata?: Record<string, any>;
}

// 内存缓存
let datasetsCache: Dataset[] | null = null;
let datasetRowsCache: DatasetRow[] | null = null;

function mergeMetadata(
  existing: Record<string, any> | undefined,
  incoming: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!existing && !incoming) {
    return undefined;
  }

  const base = existing ? { ...existing } : {};
  if (!incoming) {
    return base;
  }

  const merged = { ...base, ...incoming };

  const existingJobIds = Array.isArray(base.jobIds) ? base.jobIds.filter(Boolean) : [];
  const incomingJobIds = Array.isArray(incoming.jobIds) ? incoming.jobIds.filter(Boolean) : [];

  const unionJobIds = Array.from(new Set([...existingJobIds, ...incomingJobIds]));
  if (unionJobIds.length > 0) {
    merged.jobIds = unionJobIds;
  } else if (existingJobIds.length > 0 && !merged.jobIds) {
    merged.jobIds = existingJobIds;
  }

  if (incoming.jobId) {
    merged.jobId = incoming.jobId;
  }

  return merged;
}

/**
 * 初始化数据集记录文件
 */
async function initDatasetsFile(): Promise<void> {
  await ensureDir(DATA_DIR);

  try {
    await fs.access(DATASETS_FILE);
  } catch (err) {
    // 文件不存在，创建空记录
    await fs.writeFile(DATASETS_FILE, JSON.stringify([]));
  }
}

/**
 * 初始化数据集行索引文件
 */
async function initDatasetRowsFile(): Promise<void> {
  await ensureDir(DATA_DIR);

  try {
    await fs.access(DATASET_ROWS_FILE);
  } catch (err) {
    // 文件不存在，创建空记录
    await fs.writeFile(DATASET_ROWS_FILE, JSON.stringify([]));
  }
}

/**
 * 获取所有数据集
 * @returns 数据集数组
 */
async function getDatasets(): Promise<Dataset[]> {
  // 注意：此函数在同一进程内可使用缓存；
  // 但当有外部进程（脚本）修改 datasets.json 时，缓存会过期。
  // 关键查询（如 getEffectiveDataset）将使用新鲜读取以避免跨进程一致性问题。
  if (datasetsCache !== null) {
    return datasetsCache;
  }

  await initDatasetsFile();

  try {
    const data = await fs.readFile(DATASETS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    datasetsCache = Array.isArray(parsed) ? parsed : [];
    return datasetsCache;
  } catch (err) {
    console.error('读取数据集记录失败:', err);
    datasetsCache = [];
    return [];
  }
}

// 始终从磁盘新鲜读取（跨进程场景下用于关键查询）
async function getDatasetsFresh(): Promise<Dataset[]> {
  await initDatasetsFile();
  try {
    const data = await fs.readFile(DATASETS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('读取数据集记录失败(fresh):', err);
    return [];
  }
}

/**
 * 保存数据集
 * @param datasets 数据集数组
 */
async function saveDatasets(datasets: Dataset[]): Promise<void> {
  await initDatasetsFile();

  try {
    await fs.writeFile(DATASETS_FILE, JSON.stringify(datasets, null, 2));
    datasetsCache = [...datasets];
  } catch (err) {
    console.error('保存数据集记录失败:', err);
    throw err;
  }
}

function invalidateDatasetsCache(): void {
  datasetsCache = null;
}

/**
 * 获取所有数据集行
 * @returns 所有数据集行数组
 */
async function getAllDatasetRows(): Promise<DatasetRow[]> {
  if (datasetRowsCache !== null) {
    return datasetRowsCache;
  }

  await initDatasetRowsFile();

  try {
    const data = await fs.readFile(DATASET_ROWS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    datasetRowsCache = Array.isArray(parsed) ? parsed : [];
    return datasetRowsCache;
  } catch (err) {
    console.error('读取数据集行记录失败:', err);
    datasetRowsCache = [];
    return [];
  }
}

/**
 * 保存数据集行
 * @param rows 数据集行数组
 */
async function saveAllDatasetRows(rows: DatasetRow[]): Promise<void> {
  await initDatasetRowsFile();

  try {
    await fs.writeFile(DATASET_ROWS_FILE, JSON.stringify(rows, null, 2));
    datasetRowsCache = rows;
  } catch (err) {
    console.error('保存数据集行记录失败:', err);
    throw err;
  }
}

/**
 * 生成数据集ID
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @returns 数据集ID
 */
export function generateDatasetId(
  userId: string,
  platform: string,
  year: number,
  month: number
): string {
  const key = `${userId}:${platform}:${year}:${month}`;
  return `dataset-${crypto.createHash('sha256').update(key).digest('hex').substring(0, 8)}`;
}

/**
 * 创建数据集
 * @param params 数据集参数
 * @returns 数据集
 */
export async function createDataset(params: CreateDatasetParams): Promise<Dataset> {
  // 使用新鲜读取，避免在被脚本/其他进程修改后的缓存上继续操作
  const datasets = await getDatasetsFresh();

  // 查找同一 id 的所有记录（不论状态），避免重复条目
  const matches = datasets
    .map((d, i) => ({ d, i }))
    .filter(x => x.d.id === params.id);
  const existingDataset = matches.length > 0 ? matches[0].d : undefined;

  const now = new Date().toISOString();

  if (existingDataset) {
    // 如果有重复条目，保留第一条，移除其余同 id 记录
    for (let k = matches.length - 1; k >= 1; k--) {
      datasets.splice(matches[k].i, 1);
    }
    // 重新激活并更新元数据
    existingDataset.status = 'active';
    existingDataset.effectiveUploadId = params.uploadId;
    existingDataset.updatedAt = now;
    existingDataset.metadata = mergeMetadata(existingDataset.metadata, params.metadata);

    await saveDatasets(datasets);
    invalidateDatasetsCache();
    return existingDataset;
  }

  // 创建新数据集
  const newDataset: Dataset = {
    id: params.id,
    userId: params.userId,
    platform: params.platform,
    year: params.year,
    month: params.month,
    effectiveUploadId: params.uploadId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    metadata: mergeMetadata(undefined, params.metadata)
  };

  datasets.push(newDataset);
  await saveDatasets(datasets);
  invalidateDatasetsCache();

  return newDataset;
}

export async function upsertDatasetMetadata(
  datasetId: string,
  metadata: Record<string, any>
): Promise<Dataset | null> {
  const datasets = await getDatasets();
  const index = datasets.findIndex(dataset => dataset.id === datasetId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const dataset = datasets[index];

  dataset.metadata = mergeMetadata(dataset.metadata, metadata);
  dataset.updatedAt = now;

  datasets[index] = dataset;
  await saveDatasets(datasets);
  invalidateDatasetsCache();

  return dataset;
}

/**
 * 获取数据集
 * @param datasetId 数据集ID
 * @returns 数据集或null
 */
export async function getDataset(datasetId: string): Promise<Dataset | null> {
  const datasets = await getDatasets();
  return datasets.find(dataset => dataset.id === datasetId) || null;
}

/**
 * 获取有效数据集
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @returns 数据集或null
 */
export async function getEffectiveDataset(
  userId: string,
  platform: string,
  year: number,
  month: number
): Promise<Dataset | null> {
  // 使用新鲜读取，避免被其他进程（如清理脚本）修改后的缓存污染
  const datasets = await getDatasetsFresh();
  const related = datasets.filter(dataset =>
    dataset.userId === userId &&
    dataset.platform === platform &&
    dataset.year === year &&
    dataset.month === month
  );
  // 诊断：列出同周期的所有记录
  try {
    console.log('[datasets-debug] getEffectiveDataset related', related.map(d => ({ id: d.id, status: d.status, metadata: d.metadata })));
  } catch {}
  return related.find(dataset => dataset.status === 'active') || null;
}

/**
 * 替换数据集
 * @param datasetId 数据集ID
 * @param newUploadId 新上传ID
 * @returns 更新后的数据集
 */
export async function replaceDataset(
  datasetId: string,
  newUploadId: string
): Promise<Dataset | null> {
  const datasets = await getDatasets();
  const index = datasets.findIndex(dataset => dataset.id === datasetId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const dataset = datasets[index];

  // 更新数据集
  dataset.effectiveUploadId = newUploadId;
  dataset.updatedAt = now;

  await saveDatasets(datasets);
  return dataset;
}

/**
 * 标记数据集为已替代
 * @param datasetId 数据集ID
 * @param supersededBy 替代者ID
 * @returns 更新后的数据集
 */
export async function supersede(
  datasetId: string,
  supersededBy: string
): Promise<Dataset | null> {
  const datasets = await getDatasetsFresh();
  const now = new Date().toISOString();

  // 标记同 id 的所有记录为 superseded，避免残留多个active
  let found: Dataset | null = null;
  for (let i = 0; i < datasets.length; i++) {
    const d = datasets[i];
    if (d.id === datasetId) {
      d.status = 'superseded';
      d.updatedAt = now;
      d.supersededAt = now;
      d.supersededBy = supersededBy;
      if (!found) found = d;
    }
  }

  if (!found) return null;

  await saveDatasets(datasets);
  invalidateDatasetsCache();
  return found;
}

/**
 * 清空指定租户某平台某年月的结算数据（方案A：soft delete + 删除parquet）
 * - 将对应 dataset 标记为 superseded
 * - 删除对应 parquet 目录（fact/agg 有效视图）
 * - 返回清理结果摘要
 */
export async function clearSettlementForPeriod(
  userId: string,
  platform: string,
  year: number,
  month: number,
): Promise<{ status: 'not_found' } | { status: 'cleared'; datasetId: string; jobIds?: string[] }> {
  const ds = await getEffectiveDataset(userId, platform, year, month);
  if (!ds) {
    return { status: 'not_found' };
  }

  // 收集 jobIds（供返回与日志）
  const jobIds = Array.isArray(ds.metadata?.jobIds)
    ? ds.metadata!.jobIds
    : (ds.metadata?.jobId ? [ds.metadata.jobId] : undefined);

  // 调试：清理前状态
  try {
    const allRows = await getAllDatasetRows();
    const relatedRows = allRows.filter(r => r.datasetId === ds.id);
    const baseParquetDir = path.join(process.cwd(), 'data', 'parquet');
    const factDir = path.join(baseParquetDir, 'fact_settlement_effective', `user_id=${userId}`, `platform=${platform}`, `year=${year}`, `month=${month}`);
    const aggDir = path.join(baseParquetDir, 'agg_month_sku_effective', `user_id=${userId}`, `platform=${platform}`, `year=${year}`, `month=${month}`);
    console.log('[clear-debug] before', {
      datasetId: ds.id,
      datasetStatus: ds.status,
      datasetRowCountForThisDataset: relatedRows.length,
      factEffectiveDirExists: fsSync.existsSync(factDir),
      aggEffectiveDirExists: fsSync.existsSync(aggDir),
    });
  } catch {}

  // 1) 将 dataset 软删除（标记替代）
  const cleared = await supersede(ds.id, 'manual-clear');

  // 2) 删除 parquet 目录（fact/agg 有效视图）
  const baseParquetDir = path.join(process.cwd(), 'data', 'parquet');
  const factDir = path.join(
    baseParquetDir,
    'fact_settlement_effective',
    `user_id=${userId}`,
    `platform=${platform}`,
    `year=${year}`,
    `month=${month}`
  );
  const aggDir = path.join(
    baseParquetDir,
    'agg_month_sku_effective',
    `user_id=${userId}`,
    `platform=${platform}`,
    `year=${year}`,
    `month=${month}`
  );

  try {
    await fs.rm(factDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('[clear] remove fact dir failed', { factDir, error: (e as Error)?.message });
  }
  try {
    await fs.rm(aggDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('[clear] remove agg dir failed', { aggDir, error: (e as Error)?.message });
  }

  // 同步清理 dataset_rows 的索引（删除属于该 datasetId 的行）
  try {
    const allRows = await getAllDatasetRows();
    const remaining = allRows.filter(r => r.datasetId !== ds.id);
    if (remaining.length !== allRows.length) {
      await saveAllDatasetRows(remaining);
    }
    const baseParquetDir = path.join(process.cwd(), 'data', 'parquet');
    const factDir = path.join(baseParquetDir, 'fact_settlement_effective', `user_id=${userId}`, `platform=${platform}`, `year=${year}`, `month=${month}`);
    const aggDir = path.join(baseParquetDir, 'agg_month_sku_effective', `user_id=${userId}`, `platform=${platform}`, `year=${year}`, `month=${month}`);
    // 重新读取 dataset 状态，确保已经 superseded
    const refreshed = await getDatasetsFresh();
    const refreshedDs = refreshed.find(d => d.id === ds.id);
    console.log('[clear-debug] after', {
      datasetRowCountForThisDataset: remaining.filter(r => r.datasetId === ds.id).length,
      factEffectiveDirExists: fsSync.existsSync(factDir),
      aggEffectiveDirExists: fsSync.existsSync(aggDir),
      datasetStatus: refreshedDs?.status,
    });
  } catch {}

  console.log('[clear] settlement cleared', { userId, platform, year, month, datasetId: ds.id, jobIds });
  return { status: 'cleared', datasetId: ds.id, jobIds };
}

/**
 * 生成行键
 * @param platform 平台
 * @param orderId 订单ID
 * @param skuCode SKU代码
 * @param lineNo 行号
 * @returns 行键
 */
export function generateRowKey(
  platform: string,
  orderId: string,
  skuCode: string,
  lineNo?: number
): string {
  if (lineNo !== undefined) {
    return `${platform}:${orderId}:${skuCode}:${lineNo}`;
  }
  return `${platform}:${orderId}:${skuCode}`;
}

/**
 * 生成行哈希
 * @param data 数据对象
 * @returns 哈希值
 */
export function generateRowHash(data: Record<string, any>): string {
  // 排序键以确保一致性
  const keys = Object.keys(data).sort();
  const values = keys.map(key => data[key]);

  // 计算哈希
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(values));
  return hash.digest('hex');
}

/**
 * 添加数据集行
 * @param datasetId 数据集ID
 * @param uploadId 上传ID
 * @param rowKey 行键
 * @param rowHash 行哈希
 * @returns 数据集行
 */
export async function addDatasetRow(
  datasetId: string,
  uploadId: string,
  rowKey: string,
  rowHash: string
): Promise<DatasetRow> {
  const rows = await getAllDatasetRows();

  const now = new Date().toISOString();
  const row: DatasetRow = {
    datasetId,
    uploadId,
    rowKey,
    rowHash,
    createdAt: now,
    updatedAt: now,
  };

  rows.push(row);
  await saveAllDatasetRows(rows);

  return row;
}

/**
 * 获取数据集行
 * @param datasetId 数据集ID
 * @param rowKey 行键
 * @returns 数据集行或null
 */
export async function getDatasetRow(
  datasetId: string,
  rowKey: string
): Promise<DatasetRow | null> {
  const rows = await getAllDatasetRows();
  return rows.find(row => row.datasetId === datasetId && row.rowKey === rowKey) || null;
}

/**
 * 获取数据集的所有行
 * @param datasetId 数据集ID
 * @returns 数据集行数组
 */
export async function getDatasetRows(datasetId: string): Promise<DatasetRow[]> {
  const rows = await getAllDatasetRows();
  return rows.filter(row => row.datasetId === datasetId);
}
