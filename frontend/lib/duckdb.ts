/**
 * DuckDB helper utilities for the frontend server environment (API routes, worker).
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { Database } from 'duckdb-async';
import { config } from './config';
async function initSchema(db: Database): Promise<void> {
  const schemaPath = path.join(process.cwd(), 'backend', 'sql', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const statements = schemaSql.split(';').map(stmt => stmt.trim()).filter(Boolean);
  for (const statement of statements) {
    await db.run(statement);
  }
}
let dbInstance: Database | null = null;

export async function getDB(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  const configuredPath = config().database.duckdbPath;
  const defaultPath = './data/fitax.duckdb';
  const shouldUseMemory = !configuredPath || configuredPath === ':memory:' || configuredPath === defaultPath;
  const dbTarget = shouldUseMemory ? ':memory:' : configuredPath;
  if (dbTarget !== ':memory:') {
    await fs.mkdir(path.dirname(dbTarget), { recursive: true });
  }
  console.log('[duckdb] init path =', dbTarget);
  dbInstance = await Database.create(dbTarget);
  await initSchema(dbInstance);
  return dbInstance;
}
type ViewKind = 'fact' | 'agg';
function buildParquetPaths(
  kind: ViewKind,
  userId: string,
  platform: string,
  year: number,
  month: number,
  jobIds: string[] | undefined
): string[] {
  const baseDir = kind === 'fact'
    ? 'fact_settlement_effective'
    : 'agg_month_sku_effective';
  const fileName = kind === 'fact' ? 'fact_settlement.parquet' : 'agg_month_sku.parquet';
  const dir = path.join(
    process.cwd(),
    'data',
    'parquet',
    baseDir,
    `user_id=${userId}`,
    `platform=${platform}`,
    `year=${year}`,
    `month=${month}`
  );
  let jobs: string[] = [];
  if (jobIds && jobIds.length > 0) {
    jobs = jobIds;
  } else {
    try {
      jobs = fsSync.readdirSync(dir)
        .filter(name => name.startsWith('job_id=') && !name.endsWith('.placeholder'))
        .map(name => name.replace('job_id=', ''));
    } catch {
      jobs = [];
    }
  }
  return jobs
    .map(jobId => path.join(dir, `job_id=${jobId}`, fileName))
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
interface QueryOptions {
  platform: string;
  year: number;
  month: number;
  sku?: string;
  limit?: number;
  offset?: number;
  userId?: string;
}
function buildConditions(kind: ViewKind, opts: QueryOptions) {
  const conditions: string[] = ['t.platform = ?', 't.year = ?', 't.month = ?'];
  const params: any[] = [opts.platform, opts.year, opts.month];
  if (opts.userId) {
    conditions.push('t.user_id = ?');
    params.push(opts.userId);
  }
  if (opts.sku) {
    conditions.push('t.internal_sku LIKE ?');
    params.push(`%${opts.sku}%`);
  }
  return { conditions, params };
}
async function safeAll<T>(db: Database, sql: string, params: any[]): Promise<T[]> {
  try {
    return await db.all<T>(sql, ...params);
  } catch (err: any) {
    const message = err?.message || '';
    if (message.includes('No files found that match the pattern')) {
      return [];
    }
    throw err;
  }
}
async function safeGet<T>(db: Database, sql: string, params: any[]): Promise<T | null> {
  try {
    const rows = await db.all<T>(sql, ...params);
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return row ?? null;
  } catch (err: any) {
    const message = err?.message || '';
    if (message.includes('No files found that match the pattern')) {
      return null;
    }
    throw err;
  }
}
export async function queryFactData(
  platform: string,
  year: number,
  month: number,
  sku?: string,
  limit = 1000,
  offset = 0,
  userId?: string,
  jobIds?: string[]
): Promise<any[]> {
  const db = await getDB();
  if (!userId) {
    throw new Error('userId is required to query fact data');
  }
  const files = buildParquetPaths('fact', userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return [];
  }
  const { conditions, params } = buildConditions('fact', { platform, year, month, sku, userId });
  const fileList = files
    .map(f => `'${f.replace(/'/g, "''")}'`)
    .join(', ');
  const parquetSource = files.length === 1
    ? fileList
    : `array[${fileList}]`;
  console.log('[duckdb] fact files', files);
  const sql = `
    SELECT *
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.order_id, t.internal_sku
    LIMIT ?
    OFFSET ?
  `;
  const finalParams = [...params, limit, offset];
  console.log('[duckdb] fact sql', sql.trim(), finalParams);
  return safeAll(db, sql, finalParams);
}
export async function queryAggData(
  platform: string,
  year: number,
  month: number,
  sku?: string,
  limit = 1000,
  offset = 0,
  userId?: string,
  jobIds?: string[]
): Promise<any[]> {
  const db = await getDB();
  if (!userId) {
    throw new Error('userId is required to query agg data');
  }
  const files = buildParquetPaths('agg', userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return [];
  }
  const { conditions, params } = buildConditions('agg', { platform, year, month, sku, userId });
  const fileList = files
    .map(f => `'${f.replace(/'/g, "''")}'`)
    .join(', ');
  const parquetSource = files.length === 1
    ? fileList
    : `array[${fileList}]`;
  console.log('[duckdb] agg files', files);
  const sql = `
    SELECT *
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.internal_sku
    LIMIT ?
    OFFSET ?
  `;
  const finalParams = [...params, limit, offset];
  console.log('[duckdb] agg sql', sql.trim(), finalParams);
  return safeAll(db, sql, finalParams);
}
export async function countFactRows(
  platform: string,
  year: number,
  month: number,
  userId: string,
  sku?: string,
  jobIds?: string[]
): Promise<number> {
  const db = await getDB();
  const files = buildParquetPaths('fact', userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return 0;
  }
  const { conditions, params } = buildConditions('fact', { platform, year, month, sku, userId });
  const fileList = files
    .map(f => `'${f.replace(/'/g, "''")}'`)
    .join(', ');
  const parquetSource = files.length === 1
    ? fileList
    : `array[${fileList}]`;
  const sql = `
    SELECT COUNT(*) AS count
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
  `;
  const row = await safeGet<{ count: number }>(db, sql, params);
  return row?.count ?? 0;
}
export async function countAggRows(
  platform: string,
  year: number,
  month: number,
  userId: string,
  sku?: string,
  jobIds?: string[]
): Promise<number> {
  const db = await getDB();
  const files = buildParquetPaths('agg', userId, platform, year, month, jobIds);
  if (files.length === 0) {
    return 0;
  }
  const { conditions, params } = buildConditions('agg', { platform, year, month, sku, userId });
  const fileList = files
    .map(f => `'${f.replace(/'/g, "''")}'`)
    .join(', ');
  const parquetSource = files.length === 1
    ? fileList
    : `array[${fileList}]`;
  const sql = `
    SELECT COUNT(*) AS count
    FROM read_parquet(${parquetSource}) AS t
    WHERE ${conditions.join(' AND ')}
  `;
  const row = await safeGet<{ count: number }>(db, sql, params);
  return row?.count ?? 0;
}
export async function loadParquetToTable(parquetPath: string, tableName: string): Promise<void> {
  const db = await getDB();
  await db.run(`DROP TABLE IF EXISTS temp_${tableName}`);
  await db.run(`CREATE TABLE temp_${tableName} AS SELECT * FROM read_parquet(?)`, parquetPath);
  await db.run(`INSERT INTO ${tableName} SELECT * FROM temp_${tableName}`);
  await db.run(`DROP TABLE temp_${tableName}`);
}
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
