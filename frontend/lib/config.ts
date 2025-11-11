/**
 * 配置管理
 * 负责环境变量读取与管理
 */

// 存储驱动类型
export type StorageDriver = 'local' | 's3' | 'ali-oss';
// 队列驱动类型
export type QueueDriver = 'inmemory' | 'upstash' | 'sqs' | 'mns';
// 数据库驱动类型
export type DatabaseDriver = 'duckdb' | 'postgres';

// 存储配置
export interface StorageConfig {
  driver: StorageDriver;
  baseDir?: string; // local storage 基础目录
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Endpoint?: string;
  ossRegion?: string;
  ossBucket?: string;
  ossAccessKey?: string;
  ossSecretKey?: string;
  ossEndpoint?: string;
}

// 队列配置
export interface QueueConfig {
  driver: QueueDriver;
  upstashRedisUrl?: string;
  sqsQueueUrl?: string;
  sqsRegion?: string;
  sqsAccessKey?: string;
  sqsSecretKey?: string;
  mnsEndpoint?: string;
  mnsQueueName?: string;
  mnsAccessKey?: string;
  mnsSecretKey?: string;
}

// 数据库配置
export interface DatabaseConfig {
  driver: DatabaseDriver;
  duckdbPath?: string;
  postgresUrl?: string;
}

// 应用配置
export interface AppConfig {
  environment: 'development' | 'production';
  baseUrl: string;
  maxUploadSize: number; // 单位 MB
  allowedExtensions: string[];
  signedUrlExpiry: number; // 单位 秒
  storage: StorageConfig;
  queue: QueueConfig;
  database: DatabaseConfig;
}

// 配置单例
let configInstance: AppConfig | null = null;

/**
 * 获取配置
 * @returns 应用配置
 */
export function config(): AppConfig {
  if (configInstance) {
    return configInstance;
  }

  // 从环境变量中读取配置
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

  const storageDriver = (process.env.STORAGE_DRIVER || 'local') as StorageDriver;
  const queueDriver = (process.env.QUEUE_DRIVER || 'inmemory') as QueueDriver;
  const databaseDriver = (process.env.DATABASE_DRIVER || 'duckdb') as DatabaseDriver;

  configInstance = {
    environment,
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    maxUploadSize: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),
    allowedExtensions: (process.env.ALLOWED_EXT || 'xlsx,xls,csv').split(','),
    signedUrlExpiry: parseInt(process.env.SIGN_URL_TTL_SEC || '3600', 10),

    // 存储配置
    storage: {
      driver: storageDriver,
      baseDir: process.env.STORAGE_LOCAL_DIR || './data',
      s3Region: process.env.S3_REGION,
      s3Bucket: process.env.S3_BUCKET,
      s3AccessKey: process.env.S3_ACCESS_KEY,
      s3SecretKey: process.env.S3_SECRET_KEY,
      s3Endpoint: process.env.S3_ENDPOINT,
      ossRegion: process.env.OSS_REGION,
      ossBucket: process.env.OSS_BUCKET,
      ossAccessKey: process.env.OSS_ACCESS_KEY,
      ossSecretKey: process.env.OSS_SECRET_KEY,
      ossEndpoint: process.env.OSS_ENDPOINT,
    },

    // 队列配置
    queue: {
      driver: queueDriver,
      upstashRedisUrl: process.env.UPSTASH_REDIS_URL,
      sqsQueueUrl: process.env.SQS_QUEUE_URL,
      sqsRegion: process.env.SQS_REGION,
      sqsAccessKey: process.env.SQS_ACCESS_KEY,
      sqsSecretKey: process.env.SQS_SECRET_KEY,
      mnsEndpoint: process.env.MNS_ENDPOINT,
      mnsQueueName: process.env.MNS_QUEUE_NAME,
      mnsAccessKey: process.env.MNS_ACCESS_KEY,
      mnsSecretKey: process.env.MNS_SECRET_KEY,
    },

    // 数据库配置
    database: {
      driver: databaseDriver,
      duckdbPath: process.env.DUCKDB_PATH || './data/fitax.duckdb',
      postgresUrl: process.env.POSTGRES_URL,
    }
  };

  return configInstance;
}

/**
 * 重置配置（仅用于测试）
 */
export function resetConfig(): void {
  configInstance = null;
}