/**
 * 存储抽象基类
 * 定义了所有存储驱动必须实现的接口
 */
import { Readable } from 'stream';

/**
 * 对象元数据
 */
export interface Metadata {
  [key: string]: string;
}

/**
 * 存储选项
 */
export interface PutOptions {
  contentType?: string;
  metadata?: Metadata;
}

/**
 * 预签名URL选项
 */
export interface SignedUrlOptions {
  contentType?: string;
  expiresIn?: number;
  fileName?: string;
  metadata?: Metadata;
}

/**
 * 存储抽象
 */
export abstract class Storage {
  /**
   * 上传对象
   * @param key 对象键
   * @param body 对象内容
   * @param opts 选项
   */
  abstract putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void>;

  /**
   * 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  abstract getObject(key: string): Promise<Buffer>;

  /**
   * 检查对象是否存在
   * @param key 对象键
   * @returns 是否存在
   */
  abstract exists(key: string): Promise<boolean>;

  /**
   * 删除对象
   * @param key 对象键
   */
  abstract deleteObject(key: string): Promise<void>;

  /**
   * 获取预签名上传URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  abstract getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;

  /**
   * 获取预签名下载URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  abstract getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;

  /**
   * 列出对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  abstract list(prefix: string): Promise<string[]>;
}