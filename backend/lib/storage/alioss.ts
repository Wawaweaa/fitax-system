/**
 * 阿里云 OSS 存储驱动
 * 适用于阿里云对象存储服务
 */
import { Readable } from 'stream';
import OSS from 'ali-oss';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';

export class AliOSSStorage extends Storage {
  private client: OSS;
  private bucket: string;

  constructor() {
    super();

    const { region, bucket, endpoint, accessKey, secretKey } = config().storage;

    if (!bucket) {
      throw new Error('OSS bucket name is required');
    }

    if (!accessKey || !secretKey) {
      throw new Error('OSS requires accessKey and secretKey');
    }

    this.client = new OSS({
      region: region,
      accessKeyId: accessKey,
      accessKeySecret: secretKey,
      bucket: bucket,
      endpoint: endpoint, // 如果提供了自定义终端节点
    });

    this.bucket = bucket;
  }

  /**
   * 上传对象到 OSS
   * @param key 对象键
   * @param body 对象内容
   * @param opts 上传选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const headers: any = {};

    if (opts?.contentType) {
      headers['Content-Type'] = opts.contentType;
    }

    if (opts?.metadata) {
      // 阿里云 OSS 的元数据前缀为 x-oss-meta-
      for (const [k, v] of Object.entries(opts.metadata)) {
        headers[`x-oss-meta-${k}`] = v;
      }
    }

    await this.client.put(key, body, {
      headers,
    });
  }

  /**
   * 从 OSS 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.get(key);

    // 阿里云 OSS SDK 可能直接返回 Buffer 或 Readable 流
    if (Buffer.isBuffer(result.content)) {
      return result.content;
    } else if (result.content instanceof Readable) {
      // 如果是流，则读取并转换为 Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of result.content) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } else {
      // 如果是其他类型（如字符串），则转换为 Buffer
      return Buffer.from(result.content);
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
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 默认过期时间为1小时，或使用配置的过期时间
    const expiresIn = opts?.expiresIn || config().signedUrlExpiry;

    const headers: any = {};
    if (opts?.contentType) {
      headers['Content-Type'] = opts.contentType;
    }

    // 阿里云OSS的签名URL
    // @ts-ignore
    const url = this.client.signatureUrl(key, {
      method: 'PUT',
      expires: expiresIn,
      // headers, // ali-oss types might not support headers in signatureUrl yet or typed incorrectly?
    });

    return url;
  }

  /**
   * 获取预签名下载URL
   * @param key 对象键
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    // 默认过期时间为1小时，或使用配置的过期时间
    const expiresIn = opts?.expiresIn || config().signedUrlExpiry;

    const headers: any = {};
    const responseHeaders: any = {};

    // 如果提供了文件名，设置响应头
    if (opts?.fileName) {
      responseHeaders['content-disposition'] = `attachment; filename="${encodeURIComponent(opts.fileName)}"`;
    }

    // 阿里云OSS的签名URL
    // @ts-ignore
    const url = this.client.signatureUrl(key, {
      expires: expiresIn,
      // headers,
      response: responseHeaders,
    });

    return url;
  }

  /**
   * 列出指定前缀的所有对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const result: string[] = [];
    let nextMarker = '';
    let isTruncated = true;

    while (isTruncated) {
      const response = await this.client.list({
        prefix,
        marker: nextMarker,
        "max-keys": 1000 // required parameter
      }, {});

      if (response.objects) {
        for (const object of response.objects) {
          result.push(object.name);
        }
      }

      nextMarker = response.nextMarker || '';
      isTruncated = response.isTruncated;
    }

    return result;
  }
}