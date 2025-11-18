/**
 * 阿里云OSS存储驱动
 * 用于国内环境，将文件存储在阿里云OSS
 */
import OSS from 'ali-oss';
import { Readable } from 'stream';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';

/**
 * 阿里云OSS存储驱动
 */
export class AliOSSStorage extends Storage {
  private client: OSS;
  private bucket: string;

  /**
   * 构造函数
   * @param options OSS配置选项
   */
  constructor(options?: {
    region?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
  }) {
    super();

    const storageConfig = config().storage;

    const region = options?.region || storageConfig.ossRegion || '';
    this.bucket = options?.bucket || storageConfig.ossBucket || '';
    const accessKey = options?.accessKey || storageConfig.ossAccessKey || '';
    const secretKey = options?.secretKey || storageConfig.ossSecretKey || '';
    const endpoint = options?.endpoint || storageConfig.ossEndpoint;

    if (!region || !this.bucket || !accessKey || !secretKey) {
      throw new Error('阿里云OSS存储驱动配置不完整，请检查环境变量');
    }

    // 创建OSS客户端
    this.client = new OSS({
      region,
      bucket: this.bucket,
      accessKeyId: accessKey,
      accessKeySecret: secretKey,
      endpoint,
      secure: true, // 使用HTTPS
    });
  }

  /**
   * 上传对象
   * @param key 对象键
   * @param body 对象内容
   * @param opts 选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const options: OSS.PutObjectOptions = {
      mime: opts?.contentType,
    };

    // 添加元数据
    if (opts?.metadata) {
      options.headers = options.headers || {};
      for (const [key, value] of Object.entries(opts.metadata)) {
        options.headers[`x-oss-meta-${key}`] = value;
      }
    }

    await this.client.put(key, body, options);
  }

  /**
   * 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.client.get(key);
      return Buffer.from(result.content);
    } catch (err: any) {
      if (err.code === 'NoSuchKey') {
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
    try {
      await this.client.head(key);
      return true;
    } catch (err: any) {
      if (err.code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  /**
   * 删除对象
   * @param key 对象键
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.delete(key);
  }

  /**
   * 获取预签名上传URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const options: OSS.SignatureUrlOptions = {
      method: 'PUT',
      expires: opts?.expiresIn || config().signedUrlExpiry,
    };

    // 添加Content-Type
    if (opts?.contentType) {
      options.headers = options.headers || {};
      options.headers['Content-Type'] = opts.contentType;
    }

    // 添加元数据
    if (opts?.metadata) {
      options.headers = options.headers || {};
      for (const [key, value] of Object.entries(opts.metadata)) {
        options.headers[`x-oss-meta-${key}`] = value;
      }
    }

    return this.client.signatureUrl(key, options);
  }

  /**
   * 获取预签名下载URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const options: OSS.SignatureUrlOptions = {
      expires: opts?.expiresIn || config().signedUrlExpiry,
    };

    // 添加Content-Disposition
    if (opts?.fileName) {
      options.response = options.response || {};
      options.response['content-disposition'] = `attachment; filename="${encodeURIComponent(opts.fileName)}"`;
    }

    // 添加Content-Type
    if (opts?.contentType) {
      options.response = options.response || {};
      options.response['content-type'] = opts.contentType;
    }

    return this.client.signatureUrl(key, options);
  }

  /**
   * 列出对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const results: string[] = [];
    let nextMarker: string | null = null;

    do {
      const listResult: OSS.ListResult = await this.client.list({
        prefix,
        marker: nextMarker || undefined,
        'max-keys': 1000,
      });

      // 添加对象键到结果
      if (listResult.objects) {
        for (const object of listResult.objects) {
          results.push(object.name);
        }
      }

      nextMarker = listResult.nextMarker || null;
    } while (nextMarker);

    return results;
  }
}