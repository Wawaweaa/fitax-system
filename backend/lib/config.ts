/**
 * 系统配置
 * 从环境变量加载所有配置项
 */

// 存储相关配置
export interface StorageConfig {
  driver: string; // 'local' | 's3' | 'alioss'
  region?: string;
  bucket?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  // 本地开发配置
  localPath?: string;
}

// 队列相关配置
export interface QueueConfig {
  driver: string; // 'local' | 'redis' | 'sqs' | 'mns'
  url?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  queueName?: string;
}

// 数据库相关配置
export interface DatabaseConfig {
  driver: string; // 'duckdb' | 'postgres'
  url?: string;
  duckdbPath?: string;
}

// 系统配置
export interface AppConfig {
  env: string; // 'development' | 'production' | 'test'
  storage: StorageConfig;
  queue: QueueConfig;
  database: DatabaseConfig;
  uploadMaxSize: number; // 单位: MB
  allowedFileTypes: string[];
  signedUrlExpiry: number; // 单位: 秒
}

/**
 * 获取配置
 */
export function getConfig(): AppConfig {
  // 根据环境变量加载配置
  const config: AppConfig = {
    env: process.env.NODE_ENV || 'development',
    storage: {
      driver: process.env.STORAGE_DRIVER || 'local',
      region: process.env.STORAGE_REGION,
      bucket: process.env.STORAGE_BUCKET,
      endpoint: process.env.STORAGE_ENDPOINT,
      accessKey: process.env.STORAGE_ACCESS_KEY,
      secretKey: process.env.STORAGE_SECRET_KEY,
      localPath: process.env.STORAGE_LOCAL_PATH || './uploads'
    },
    queue: {
      driver: process.env.QUEUE_DRIVER || 'local',
      url: process.env.QUEUE_URL,
      region: process.env.QUEUE_REGION,
      accessKey: process.env.QUEUE_ACCESS_KEY,
      secretKey: process.env.QUEUE_SECRET_KEY,
      queueName: process.env.QUEUE_NAME || 'fitax-jobs'
    },
    database: {
      driver: process.env.DATABASE_DRIVER || 'duckdb',
      url: process.env.DATABASE_URL,
      duckdbPath: process.env.DUCKDB_PATH || './data/app.db'
    },
    uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '50', 10), // 默认50MB
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || '.xlsx,.xls').split(','),
    signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10) // 默认1小时
  };

  return config;
}

// 单例配置
let configInstance: AppConfig | null = null;

/**
 * 获取配置单例
 */
export function config(): AppConfig {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
}

/**
 * 重置配置（用于测试）
 */
export function resetConfig(): void {
  configInstance = null;
}