/**
 * AWS S3 存储驱动
 * 适用于 AWS S3 和兼容 S3 API 的存储服务
 */
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  S3ClientConfig
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';

export class S3Storage extends Storage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    super();

    const { region, bucket, endpoint, accessKey, secretKey } = config().storage;

    if (!bucket) {
      throw new Error('S3 bucket name is required');
    }

    const clientConfig: S3ClientConfig = {
      region: region || 'us-east-1',
    };

    // 设置自定义终端节点（如果提供）
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    // 设置凭证（如果提供）
    if (accessKey && secretKey) {
      clientConfig.credentials = {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      };
    }

    this.client = new S3Client(clientConfig);
    this.bucket = bucket;
  }

  /**
   * 上传对象到 S3
   * @param key 对象键
   * @param body 对象内容
   * @param opts 上传选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: opts?.contentType,
      Metadata: opts?.metadata,
    });

    await this.client.send(command);
  }

  /**
   * 从 S3 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    // 将响应流转换为 Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * 检查对象是否存在
   * @param key 对象键
   * @returns 是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (err) {
      if (err instanceof NotFound) {
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
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * 获取预签名上传URL
   * @param key 对象键
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts?.contentType,
    });

    // 默认过期时间为1小时，或使用配置的过期时间
    const expiresIn = opts?.expiresIn || config().signedUrlExpiry;

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * 获取预签名下载URL
   * @param key 对象键
   * @param opts 签名选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const params: any = {
      Bucket: this.bucket,
      Key: key,
    };

    // 如果提供了文件名，设置响应头
    if (opts?.fileName) {
      params.ResponseContentDisposition = `attachment; filename="${encodeURIComponent(opts.fileName)}"`;
    }

    const command = new GetObjectCommand(params);

    // 默认过期时间为1小时，或使用配置的过期时间
    const expiresIn = opts?.expiresIn || config().signedUrlExpiry;

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * 列出指定前缀的所有对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const result: string[] = [];
    let continuationToken: string | undefined = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            result.push(item.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return result;
  }
}