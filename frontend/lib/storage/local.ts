/**
 * 本地存储驱动
 * 用于开发环境，将文件存储在本地文件系统
 */
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'stream';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';
import { ensureDir } from '../server-utils';

/**
 * 本地存储驱动
 */
export class LocalStorage extends Storage {
  private baseDir: string;
  private baseUrl: string;

  /**
   * 构造函数
   * @param baseDir 基础目录
   * @param baseUrl 基础URL
   */
  constructor(baseDir?: string, baseUrl?: string) {
    super();
    this.baseDir = baseDir || path.join(process.cwd(), 'data', 'storage');
    this.baseUrl = baseUrl || 'http://localhost:3000/api/local-storage';
  }

  /**
   * 获取文件路径
   * @param key 对象键
   * @returns 文件路径
   */
  private getFilePath(key: string): string {
    return path.join(this.baseDir, ...key.split('/'));
  }

  /**
   * 获取元数据路径
   * @param key 对象键
   * @returns 元数据路径
   */
  private getMetadataPath(key: string): string {
    return `${this.getFilePath(key)}.metadata.json`;
  }

  /**
   * 上传对象
   * @param key 对象键
   * @param body 对象内容
   * @param opts 选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const filePath = this.getFilePath(key);
    const dirPath = path.dirname(filePath);

    // 确保目录存在
    await ensureDir(dirPath);

    // 写入文件
    if (Buffer.isBuffer(body)) {
      await fs.writeFile(filePath, body);
    } else {
      // 如果是流，需要先转为Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(chunk);
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    }

    // 保存元数据
    if (opts?.contentType || opts?.metadata) {
      const metadataPath = this.getMetadataPath(key);
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          contentType: opts.contentType || 'application/octet-stream',
          metadata: opts.metadata || {},
        })
      );
    }
  }

  /**
   * 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);

    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Object not found: ${key}`);
      }
      throw err;
    }
  }

  /**
   * 检查对象是否存在
   * @param key 对象键
   * @returns 是否存在
   */
  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 删除对象
   * @param key 对象键
   */
  async deleteObject(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const metadataPath = this.getMetadataPath(key);

    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    try {
      await fs.unlink(metadataPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * 获取预签名上传URL
   * 本地存储不支持预签名，返回API路径
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 本地存储不支持预签名，返回API路径
    return `${this.baseUrl}/upload?key=${encodeURIComponent(key)}`;
  }

  /**
   * 获取预签名下载URL
   * 本地存储不支持预签名，返回API路径
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 本地存储不支持预签名，返回API路径
    const url = `${this.baseUrl}/download?key=${encodeURIComponent(key)}`;

    // 如果指定了文件名，添加到URL
    if (opts?.fileName) {
      return `${url}&fileName=${encodeURIComponent(opts.fileName)}`;
    }

    return url;
  }

  /**
   * 列出对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const prefixPath = this.getFilePath(prefix);
    const prefixDir = path.dirname(prefixPath);
    const prefixBase = path.basename(prefixPath);

    try {
      // 检查前缀目录是否存在
      await fs.access(prefixDir);
    } catch (err) {
      // 目录不存在
      return [];
    }

    const results: string[] = [];

    // 递归列出文件
    await this.listFilesRecursive(prefixDir, prefixBase, prefix, results);

    return results;
  }

  /**
   * 递归列出文件
   * @param dir 目录
   * @param baseFilter 基础过滤器
   * @param prefix 前缀
   * @param results 结果数组
   */
  private async listFilesRecursive(
    dir: string,
    baseFilter: string,
    prefix: string,
    results: string[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        // 跳过元数据文件
        if (entry.name.endsWith('.metadata.json')) {
          continue;
        }

        if (entry.isDirectory()) {
          // 递归处理子目录
          await this.listFilesRecursive(entryPath, '', prefix, results);
        } else {
          // 文件路径相对于基础目录
          const relativePath = path.relative(this.baseDir, entryPath);
          // 将路径分隔符转换为正斜杠
          const normalizedPath = relativePath.split(path.sep).join('/');

          // 检查是否匹配前缀
          if (normalizedPath.startsWith(prefix)) {
            results.push(normalizedPath);
          }
        }
      }
    } catch (err: any) {
      // 忽略目录不存在错误
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
