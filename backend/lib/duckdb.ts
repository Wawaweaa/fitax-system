/**
 * DuckDB 数据库连接
 * 用于本地开发
 */
import { Database } from 'duckdb-async';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config';

// 数据库实例缓存
let dbInstance: Database | null = null;

/**
 * 初始化 DuckDB 数据库
 * @returns DuckDB 数据库实例
 */
export async function initDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  // 获取数据库路径
  const dbPath = config().database.duckdbPath;

  // 确保目录存在
  const dbDir = path.dirname(dbPath);
  try {
    await fs.mkdir(dbDir, { recursive: true });
  } catch (err) {
    // 忽略目录已存在错误
  }

  // 创建数据库连接
  dbInstance = await Database.create(dbPath);

  // 运行数据库初始化 SQL
  await initSchema();

  return dbInstance;
}

/**
 * 初始化数据库架构
 */
async function initSchema(): Promise<void> {
  if (!dbInstance) {
    throw new Error('Database instance not initialized');
  }

  // 读取并执行 schema.sql
  const schemaPath = path.join(process.cwd(), 'backend', 'sql', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');

  // 将 SQL 语句按分号分隔
  const statements = schemaSql.split(';').filter(s => s.trim());

  // 执行每个语句
  for (const statement of statements) {
    try {
      await dbInstance.run(statement);
    } catch (err) {
      console.error(`Error executing SQL statement: ${statement}`, err);
      throw err;
    }
  }
}

/**
 * 获取 DuckDB 数据库实例
 * @returns DuckDB 数据库实例
 */
export async function getDB(): Promise<Database> {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

/**
 * 关闭 DuckDB 数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 从 Parquet 文件加载数据
 * @param parquetPath Parquet 文件路径
 * @param tableName 目标表名
 */
export async function loadParquetToTable(parquetPath: string, tableName: string): Promise<void> {
  const db = await getDB();

  // 创建临时表
  await db.run(`DROP TABLE IF EXISTS temp_${tableName}`);
  await db.run(`CREATE TABLE temp_${tableName} AS SELECT * FROM read_parquet('${parquetPath}')`);

  // 将数据插入到目标表
  await db.run(`INSERT INTO ${tableName} SELECT * FROM temp_${tableName}`);

  // 删除临时表
  await db.run(`DROP TABLE temp_${tableName}`);
}

/**
 * 查询事实表数据
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param sku SKU
 * @param limit 限制条数
 * @param offset 偏移条数
 */
export async function queryFactData(
  platform: string,
  year: number,
  month: number,
  sku?: string,
  limit: number = 1000,
  offset: number = 0
): Promise<any[]> {
  const db = await getDB();

  let query = `
    SELECT
      *
    FROM
      fact_settlement
    WHERE
      platform = ?
      AND year = ?
      AND month = ?
  `;

  const params: any[] = [platform, year, month];

  if (sku) {
    query += ` AND internal_sku LIKE ?`;
    params.push(`%${sku}%`);
  }

  query += `
    ORDER BY
      order_id, internal_sku
    LIMIT ?
    OFFSET ?
  `;
  params.push(limit, offset);

  return await db.all(query, ...params);
}

/**
 * 查询聚合表数据
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param sku SKU
 * @param limit 限制条数
 * @param offset 偏移条数
 */
export async function queryAggData(
  platform: string,
  year: number,
  month: number,
  sku?: string,
  limit: number = 1000,
  offset: number = 0
): Promise<any[]> {
  const db = await getDB();

  let query = `
    SELECT
      *
    FROM
      agg_month_sku
    WHERE
      platform = ?
      AND year = ?
      AND month = ?
  `;

  const params: any[] = [platform, year, month];

  if (sku) {
    query += ` AND internal_sku LIKE ?`;
    params.push(`%${sku}%`);
  }

  query += `
    ORDER BY
      internal_sku
    LIMIT ?
    OFFSET ?
  `;
  params.push(limit, offset);

  return await db.all(query, ...params);
}

/**
 * 获取事实表数据总数
 */
export async function getFactCount(
  platform: string,
  year: number,
  month: number,
  sku?: string
): Promise<number> {
  const db = await getDB();

  let query = `
    SELECT
      COUNT(*) as count
    FROM
      fact_settlement
    WHERE
      platform = ?
      AND year = ?
      AND month = ?
  `;

  const params: any[] = [platform, year, month];

  if (sku) {
    query += ` AND internal_sku LIKE ?`;
    params.push(`%${sku}%`);
  }

  const result = await db.get(query, ...params);
  return result.count;
}

/**
 * 获取聚合表数据总数
 */
export async function getAggCount(
  platform: string,
  year: number,
  month: number,
  sku?: string
): Promise<number> {
  const db = await getDB();

  let query = `
    SELECT
      COUNT(*) as count
    FROM
      agg_month_sku
    WHERE
      platform = ?
      AND year = ?
      AND month = ?
  `;

  const params: any[] = [platform, year, month];

  if (sku) {
    query += ` AND internal_sku LIKE ?`;
    params.push(`%${sku}%`);
  }

  const result = await db.get(query, ...params);
  return result.count;
}