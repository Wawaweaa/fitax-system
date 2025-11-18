import path from 'node:path';
import fsSync from 'node:fs';
import { Database } from 'duckdb-async';
import { promises as fs } from 'node:fs';

let dbInstance: Database | null = null;

async function getPreviewDB(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  console.log('[duckdb-preview] init path = :memory:');
  dbInstance = await Database.create(':memory:');
  return dbInstance;
}

function buildParquetPaths(
  userId: string,
  platform: string,
  year: number,
  month: number,
  jobIds?: string[]
): string[] {
  const baseDir = path.join(
    process.cwd(),
    'data',
    'parquet',
    'fact_settlement_effective',
    `user_id=${userId}`,
    `platform=${platform}`,
    `year=${year}`,
    `month=${month}`
  );

  const jobs = jobIds && jobIds.length > 0
    ? jobIds
    : (() => {
        try {
          return fsSync.readdirSync(baseDir)
            .filter(name => name.startsWith('job_id='))
            .map(name => name.replace('job_id=', ''));
        } catch {
          return [];
        }
      })();

  return jobs
    .map(jobId => path.join(baseDir, `job_id=${jobId}`, 'fact_settlement.parquet'))
    .filter(fullPath => {
      try {
        const stat = fsSync.statSync(fullPath);
        return stat.isFile() && stat.size >= 1024;
      } catch {
        return false;
      }
    })
    .map(fullPath => fullPath.replace(/\\/g, '/'));
}

function buildConditions(
  platform: string,
  year: number,
  month: number,
  sku?: string,
  userId?: string
) {
  const conditions: string[] = ['t.platform = ?', 't.year = ?', 't.month = ?'];
  const params: any[] = [platform, year, month];

  if (userId) {
    conditions.push('t.user_id = ?');
    params.push(userId);
  }

  if (sku) {
    conditions.push('(t.internal_sku LIKE ? OR t.fin_code LIKE ? OR t.order_id LIKE ?)');
    params.push(`%${sku}%`, `%${sku}%`, `%${sku}%`);
  }

  return { conditions, params };
}

export async function previewFactQuery(
  platform: string,
  year: number,
  month: number,
  jobIds: string[] | undefined,
  userId: string,
  sku?: string,
  limit = 1000,
  offset = 0
): Promise<any[]> {
  const db = await getPreviewDB();
  const files = buildParquetPaths(userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return [];
  }

  const { conditions, params } = buildConditions(platform, year, month, sku, userId);

  const fileList = files.map(f => `'${f.replace(/'/g, "''")}'`).join(', ');
  const parquetSource = files.length === 1 ? fileList : `array[${fileList}]`;

  console.log('[duckdb-preview] fact files', files);

  const sql = `
    SELECT *
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.order_id, t.internal_sku
    LIMIT ?
    OFFSET ?
  `;

  const finalParams = [...params, limit, offset];
  console.log('[duckdb-preview] fact sql', sql.trim(), finalParams);
  return db.all(sql, ...finalParams);
}

// 仅按 job 文件读取（忽略行内 year/month 字段过滤），用于“只看本次处理”的导出场景
export async function previewFactQueryForJobs(
  platform: string,
  year: number,
  month: number,
  jobIds: string[] | undefined,
  userId: string,
  sku?: string,
  limit = 1000,
  offset = 0
): Promise<any[]> {
  const db = await getPreviewDB();
  const files = buildParquetPaths(userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return [];
  }

  const fileList = files.map(f => `'${f.replace(/'/g, "''")}'`).join(', ');
  const parquetSource = files.length === 1 ? fileList : `array[${fileList}]`;

  const clauses: string[] = [];
  const params: any[] = [];
  if (userId) { clauses.push('t.user_id = ?'); params.push(userId); }
  if (platform) { clauses.push('t.platform = ?'); params.push(platform); }
  if (sku) { clauses.push('(t.internal_sku LIKE ? OR t.fin_code LIKE ? OR t.order_id LIKE ?)'); params.push(`%${sku}%`, `%${sku}%`, `%${sku}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const sql = `
    SELECT *
    FROM read_parquet(${parquetSource}) AS t
    ${where}
    ORDER BY t.order_id, t.internal_sku
    LIMIT ?
    OFFSET ?
  `;
  const finalParams = [...params, limit, offset];
  console.log('[duckdb-preview] fact (jobs scope) sql', sql.trim(), finalParams);
  return db.all(sql, ...finalParams);
}

export async function previewFactCount(
  platform: string,
  year: number,
  month: number,
  jobIds: string[] | undefined,
  userId: string,
  sku?: string
): Promise<number> {
  const db = await getPreviewDB();
  const files = buildParquetPaths(userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return 0;
  }

  const { conditions, params } = buildConditions(platform, year, month, sku, userId);
  const fileList = files.map(f => `'${f.replace(/'/g, "''")}'`).join(', ');
  const parquetSource = files.length === 1 ? fileList : `array[${fileList}]`;

  const sql = `
    SELECT COUNT(*) AS count
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
  `;

  const rows = await db.all<{ count: number }>(sql, ...params);
  const row = rows[0];
  return row?.count ?? 0;
}
