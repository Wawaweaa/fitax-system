/**
 * 本地文件系统存储驱动
 * 用于开发环境
 */
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';

const streamPipeline = promisify(pipeline);

export class LocalStorage extends Storage {
  private basePath: string;

  constructor() {
    super();
    this.basePath = config().storage.localPath || './uploads';
  }

  /**
   * 确保目录存在
   * @param dirPath 目录路径
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      // 忽略目录已存在错误
    }
  }

  /**
   * 获取对象的完整路径
   * @param key 对象键
   * @returns 完整路径
   */
  private getFullPath(key: string): string {
    return path.join(this.basePath, key);
  }

  /**
   * 上传对象到本地文件系统
   * @param key 对象键
   * @param body 对象内容
   * @param opts 上传选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const fullPath = this.getFullPath(key);
    const dirPath = path.dirname(fullPath);

    // 确保目录存在
    await this.ensureDir(dirPath);

    if (Buffer.isBuffer(body)) {
      // 如果是Buffer，直接写入文件
      await fs.writeFile(fullPath, body);
    } else {
      // 如果是流，使用pipeline写入文件
      // Use standard fs for createWriteStream as fs/promises doesn't have it
      const fsStandard = require('fs');
      const writeStream = fsStandard.createWriteStream(fullPath);
      await streamPipeline(body, writeStream);
    }
  }

  /**
   * 从本地文件系统获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);
    return fs.readFile(fullPath);
  }

  /**
   * 检查对象是否存在
   * @param key 对象键
   * @returns 是否存在
   */
  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
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
    const fullPath = this.getFullPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      // 忽略文件不存在错误
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * 获取预签名上传URL（本地实现为null，直接使用putObject）
   * @param key 对象键
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 在本地实现中，返回null，因为本地不支持预签名URL
    return '';
  }

  /**
   * 获取预签名下载URL（本地实现返回文件路径）
   * @param key 对象键
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 在本地实现中，返回文件路径
    return `/local-files/${key}`;
  }

  /**
   * 列出指定前缀的所有对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const prefixPath = this.getFullPath(prefix);
    const prefixDir = path.dirname(prefixPath);

    try {
      const files = await this.listFilesRecursively(prefixDir);

      // 过滤掉不匹配前缀的文件，并转换为相对路径
      return files
        .filter(file => file.startsWith(prefixPath))
        .map(file => file.substring(this.basePath.length + 1).replace(/\\/g, '/'));
    } catch (err) {
      // 如果目录不存在，返回空数组
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * 递归列出目录下的所有文件
   * @param dir 目录路径
   * @returns 文件路径列表
   */
  private async listFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // 递归处理子目录
          const subDirFiles = await this.listFilesRecursively(fullPath);
          files.push(...subDirFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // 如果目录不存在，返回空数组
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    return files;
  }
}