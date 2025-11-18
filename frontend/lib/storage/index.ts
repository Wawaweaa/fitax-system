/**
 * 存储模块
 * 根据配置创建相应的存储驱动
 */
import { Storage } from './base';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import { AliOSSStorage } from './alioss';
import { config } from '../config';

// 存储单例
let storageInstance: Storage | null = null;

/**
 * 获取存储驱动
 * @returns 存储驱动实例
 */
export function storage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }

  const storageConfig = config().storage;

  // 根据配置创建相应的存储驱动
  switch (storageConfig.driver) {
    case 'local':
      storageInstance = new LocalStorage(storageConfig.baseDir);
      break;
    case 's3':
      storageInstance = new S3Storage();
      break;
    case 'ali-oss':
      storageInstance = new AliOSSStorage();
      break;
    default:
      throw new Error(`不支持的存储驱动: ${storageConfig.driver}`);
  }

  return storageInstance;
}

/**
 * 重置存储单例（仅用于测试）
 */
export function resetStorage(): void {
  storageInstance = null;
}

// 导出类型
export * from './base';
export { LocalStorage } from './local';
export { S3Storage } from './s3';
export { AliOSSStorage } from './alioss';