/**
 * 存储驱动工厂
 */
import { Storage } from './base';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import { AliOSSStorage } from './alioss';
import { config } from '../config';

/**
 * 创建存储驱动实例
 * @returns Storage 实例
 */
export function createStorage(): Storage {
  const storageDriver = config().storage.driver;

  switch (storageDriver) {
    case 'local':
      return new LocalStorage();
    case 's3':
      return new S3Storage();
    case 'alioss':
      return new AliOSSStorage();
    default:
      throw new Error(`Unsupported storage driver: ${storageDriver}`);
  }
}

// 导出 Storage 抽象类和各驱动类型
export * from './base';
export * from './local';
export * from './s3';
export * from './alioss';

// 存储驱动单例
let storageInstance: Storage | null = null;

/**
 * 获取存储驱动单例
 * @returns Storage 单例
 */
export function storage(): Storage {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

/**
 * 重置存储驱动单例（用于测试）
 */
export function resetStorage(): void {
  storageInstance = null;
}