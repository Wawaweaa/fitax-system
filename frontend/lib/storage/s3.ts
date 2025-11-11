/**
 * S3存储驱动
 * 用于production环境，将文件存储在Amazon S3或兼容S3的存储服务
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommandInput,
  GetObjectCommandInput,
  HeadObjectCommandInput,
  DeleteObjectCommandInput,
  ListObjectsV2CommandInput
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { Storage, PutOptions, SignedUrlOptions } from './base';
import { config } from '../config';

/**
 * S3存储驱动
 */
export class S3Storage extends Storage {
  private client: S3Client;
  private bucket: string;

  /**
   * 构造函数
   * @param options S3配置选项
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

    const region = options?.region || storageConfig.s3Region || '';
    this.bucket = options?.bucket || storageConfig.s3Bucket || '';
    const accessKey = options?.accessKey || storageConfig.s3AccessKey || '';
    const secretKey = options?.secretKey || storageConfig.s3SecretKey || '';
    const endpoint = options?.endpoint || storageConfig.s3Endpoint;

    if (!region || !this.bucket || !accessKey || !secretKey) {
      throw new Error('S3存储驱动配置不完整，请检查环境变量');
    }

    // 创建S3客户端
    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      endpoint,
    });
  }

  /**
   * 上传对象
   * @param key 对象键
   * @param body 对象内容
   * @param opts 选项
   */
  async putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void> {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: opts?.contentType,
      Metadata: opts?.metadata,
    };

    await this.client.send(new PutObjectCommand(params));
  }

  /**
   * 获取对象
   * @param key 对象键
   * @returns 对象内容
   */
  async getObject(key: string): Promise<Buffer> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      const response = await this.client.send(new GetObjectCommand(params));

      // 读取流并转换为Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as Readable) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') {
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
    const params: HeadObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      await this.client.send(new HeadObjectCommand(params));
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
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
    const params: DeleteObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    await this.client.send(new DeleteObjectCommand(params));
  }

  /**
   * 获取预签名上传URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      ContentType: opts?.contentType,
      Metadata: opts?.metadata,
    };

    const command = new PutObjectCommand(params);
    return await getSignedUrl(this.client, command, {
      expiresIn: opts?.expiresIn || config().signedUrlExpiry
    });
  }

  /**
   * 获取预签名下载URL
   * @param key 对象键
   * @param opts 选项
   * @returns 预签名URL
   */
  async getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
    };

    // 如果有文件名，添加Content-Disposition头
    if (opts?.fileName) {
      params.ResponseContentDisposition = `attachment; filename="${encodeURIComponent(opts.fileName)}"`;
    }

    // 如果有内容类型，添加Content-Type头
    if (opts?.contentType) {
      params.ResponseContentType = opts.contentType;
    }

    const command = new GetObjectCommand(params);
    return await getSignedUrl(this.client, command, {
      expiresIn: opts?.expiresIn || config().signedUrlExpiry
    });
  }

  /**
   * 列出对象
   * @param prefix 前缀
   * @returns 对象键列表
   */
  async list(prefix: string): Promise<string[]> {
    const params: ListObjectsV2CommandInput = {
      Bucket: this.bucket,
      Prefix: prefix,
    };

    const results: string[] = [];
    let continuationToken: string | undefined;

    do {
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const response = await this.client.send(new ListObjectsV2Command(params));

      // 添加对象键到结果
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            results.push(item.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return results;
  }
}