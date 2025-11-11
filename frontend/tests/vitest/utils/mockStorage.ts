/**
 * 测试用的本地存储模拟
 */
import fs from 'fs/promises';
import path from 'path';
import { Storage, PutOptions, SignedUrlOptions } from '../../../lib/storage/base';

// 确保目录存在
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * 测试用的内存存储实现
 */
export class MockStorage extends Storage {
  private storage = new Map<string, Buffer>();
  private baseDir: string;

  constructor(baseDir?: string) {
    super();
    this.baseDir = baseDir || path.join(process.cwd(), 'data', 'test-storage');
  }

  /**
   * 上传对象
   * @param key 对象键
   * @param body 对象内容
   */
  async putObject(key: string, body: Buffer | any, opts?: PutOptions): Promise<void> {
    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (typeof body === 'string') {
      buffer = Buffer.from(body);
    } else {
      buffer = Buffer.from(JSON.stringify(body));
    }

    this.storage.set(key, buffer);

    // 同时写入文件系统以便测试
    const filePath = path.join(this.baseDir, key);
    const dirPath = path.dirname(filePath);
    await ensureDir(dirPath);
    await fs.writeFile(filePath, buffer);
  }

  /**
   * 获取对象
   * @param key 对象键
   */
  async getObject(key: string): Promise<Buffer> {
    if (this.storage.has(key)) {
      return this.storage.get(key)!;
    }

    // 从文件系统读取
    const filePath = path.join(this.baseDir, key);
    try {
      return await fs.readFile(filePath);
    } catch (err) {
      throw new Error(`对象不存在: ${key}`);
    }
  }

  /**
   * 检查对象是否存在
   * @param key 对象键
   */
  async exists(key: string): Promise<boolean> {
    if (this.storage.has(key)) {
      return true;
    }

    // 检查文件系统
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除对象
   * @param key 对象键
   */
  async deleteObject(key: string): Promise<void> {
    this.storage.delete(key);

    // 同时从文件系统删除
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.unlink(filePath);
    } catch {
      // 忽略不存在的文件
    }
  }

  /**
   * 获取预签名上传URL（测试环境总是返回虚拟URL）
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    return `http://localhost/upload/${key}`;
  }

  /**
   * 获取预签名下载URL（测试环境总是返回虚拟URL）
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    return `http://localhost/download/${key}`;
  }

  /**
   * 列出对象
   * @param prefix 前缀
   */
  async list(prefix: string): Promise<string[]> {
    return Array.from(this.storage.keys()).filter(key => key.startsWith(prefix));
  }

  /**
   * 清空存储（仅用于测试）
   */
  clear(): void {
    this.storage.clear();
  }
}

// 测试用的存储实例
let mockInstance: MockStorage | null = null;

/**
 * 获取测试用的存储实例
 */
export function getMockStorage(): MockStorage {
  if (!mockInstance) {
    mockInstance = new MockStorage();
  }
  return mockInstance;
}

/**
 * 重置测试用的存储实例
 */
export function resetMockStorage(): void {
  if (mockInstance) {
    mockInstance.clear();
  }
  mockInstance = null;
}