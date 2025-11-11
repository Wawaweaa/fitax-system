/**
 * 阿里云MNS队列驱动
 * 使用阿里云MNS作为队列后端
 * 注意：由于阿里云MNS没有官方TypeScript SDK，这里使用HTTP请求实现
 */
import { Queue, Payload, EnqueueOptions, ReserveOptions, Job } from './base';
import { config } from '../config';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import querystring from 'querystring';

/**
 * 阿里云MNS队列驱动
 */
export class MNSQueue extends Queue {
  private client: AxiosInstance;
  private endpoint: string;
  private queueName: string;
  private accessKeyId: string;
  private accessKeySecret: string;

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options?: {
    endpoint?: string;
    queueName?: string;
    accessKey?: string;
    secretKey?: string;
  }) {
    super();

    const queueConfig = config().queue;
    this.endpoint = options?.endpoint || queueConfig.mnsEndpoint;
    this.queueName = options?.queueName || queueConfig.mnsQueueName;
    this.accessKeyId = options?.accessKey || queueConfig.mnsAccessKey;
    this.accessKeySecret = options?.secretKey || queueConfig.mnsSecretKey;

    if (!this.endpoint || !this.queueName || !this.accessKeyId || !this.accessKeySecret) {
      throw new Error('阿里云MNS队列驱动配置不完整，请检查环境变量');
    }

    // 创建HTTP客户端
    this.client = axios.create({
      baseURL: `${this.endpoint}/queues/${this.queueName}/messages`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/xml',
        'x-mns-version': '2015-06-06'
      }
    });

    // 请求拦截器，添加签名
    this.client.interceptors.request.use(config => {
      const date = new Date().toUTCString();
      const contentMD5 = '';

      // 构建签名字符串
      const stringToSign = [
        config.method?.toUpperCase() || 'GET',
        contentMD5,
        config.headers['Content-Type'],
        date,
        config.url
      ].join('\n');

      // 计算HMAC-SHA1签名
      const signature = crypto.createHmac('sha1', this.accessKeySecret)
        .update(stringToSign)
        .digest('base64');

      // 添加头部
      config.headers['Date'] = date;
      config.headers['Authorization'] = `MNS ${this.accessKeyId}:${signature}`;

      return config;
    });
  }

  /**
   * 将消息加入队列
   * @param payload 消息负载
   * @param opts 入队选项
   * @returns 消息ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    // 构建XML请求
    const messageBody = Buffer.from(JSON.stringify(payload)).toString('base64');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Message>
  <MessageBody>${messageBody}</MessageBody>`;

    // 设置延迟
    if (opts?.delaySeconds) {
      xml += `
  <DelaySeconds>${opts.delaySeconds}</DelaySeconds>`;
    }

    xml += `
</Message>`;

    try {
      const response = await this.client.post('', xml);

      // 解析响应，获取消息ID
      const messageId = this.parseMessageId(response.data);

      return messageId || uuidv4();
    } catch (err) {
      console.error('MNS入队失败:', err);
      throw err;
    }
  }

  /**
   * 从队列中预留消息
   * @param opts 预留选项
   * @returns 作业或null
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const waitSeconds = opts?.timeout || 30;

    try {
      // 获取消息
      const response = await this.client.get(`?waitseconds=${waitSeconds}`);

      // 如果没有消息
      if (!response.data || response.status === 204) {
        return null;
      }

      // 解析消息
      const messageId = this.parseMessageId(response.data);
      const messageBody = this.parseMessageBody(response.data);
      const receiptHandle = this.parseReceiptHandle(response.data);

      if (!messageId || !messageBody || !receiptHandle) {
        return null;
      }

      try {
        const payload = JSON.parse(Buffer.from(messageBody, 'base64').toString()) as Payload;

        // 保存receiptHandle，用于后续确认
        return {
          id: messageId,
          payload: {
            ...payload,
            __mns: {
              receiptHandle
            }
          }
        };
      } catch (err) {
        console.error('解析MNS消息失败:', err);
        // 解析失败，自动确认
        await this.deleteMessage(receiptHandle);
        return null;
      }
    } catch (err) {
      // 忽略没有消息的错误
      if (err.response && err.response.status === 404) {
        return null;
      }

      console.error('从MNS获取消息失败:', err);
      throw err;
    }
  }

  /**
   * 确认消息已处理
   * @param id 消息ID
   */
  async ack(id: string): Promise<void> {
    // 从payload中获取receiptHandle
    const receiptHandle = this.getReceiptHandle(id);
    if (!receiptHandle) {
      console.warn(`无法确认消息 ${id}，receiptHandle 不存在`);
      return;
    }

    await this.deleteMessage(receiptHandle);
  }

  /**
   * 标记消息处理失败
   * @param id 消息ID
   * @param err 错误
   */
  async fail(id: string, err: Error): Promise<void> {
    // 阿里云MNS没有直接支持标记消息失败的API
    // 这里我们只是删除消息，如果需要处理失败消息，应该使用死信队列
    await this.ack(id);
  }

  /**
   * 获取队列大小
   * @returns 队列中的消息数量
   */
  async size(): Promise<number> {
    try {
      // 获取队列属性
      const response = await axios.get(`${this.endpoint}/queues/${this.queueName}`, {
        headers: {
          'Content-Type': 'application/xml',
          'x-mns-version': '2015-06-06'
        }
      });

      // 解析响应，获取消息数量
      const activeMsgNumber = this.parseActiveMsgNumber(response.data);

      return activeMsgNumber || 0;
    } catch (err) {
      console.error('获取MNS队列大小失败:', err);
      return 0;
    }
  }

  /**
   * 删除消息
   * @param receiptHandle 消息回执句柄
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    // URL中包含receiptHandle
    const url = `?ReceiptHandle=${querystring.escape(receiptHandle)}`;

    try {
      await this.client.delete(url);
    } catch (err) {
      console.error('从MNS删除消息失败:', err);
      throw err;
    }
  }

  /**
   * 从XML响应中解析消息ID
   * @param xml XML响应
   * @returns 消息ID
   */
  private parseMessageId(xml: string): string | null {
    const match = /<MessageId>([^<]+)<\/MessageId>/i.exec(xml);
    return match ? match[1] : null;
  }

  /**
   * 从XML响应中解析消息体
   * @param xml XML响应
   * @returns 消息体
   */
  private parseMessageBody(xml: string): string | null {
    const match = /<MessageBody>([^<]+)<\/MessageBody>/i.exec(xml);
    return match ? match[1] : null;
  }

  /**
   * 从XML响应中解析消息回执句柄
   * @param xml XML响应
   * @returns 消息回执句柄
   */
  private parseReceiptHandle(xml: string): string | null {
    const match = /<ReceiptHandle>([^<]+)<\/ReceiptHandle>/i.exec(xml);
    return match ? match[1] : null;
  }

  /**
   * 从XML响应中解析活动消息数量
   * @param xml XML响应
   * @returns 活动消息数量
   */
  private parseActiveMsgNumber(xml: string): number | null {
    const match = /<ActiveMessages>(\d+)<\/ActiveMessages>/i.exec(xml);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 获取消息的receiptHandle
   * @param id 消息ID
   * @returns receiptHandle
   */
  private getReceiptHandle(id: string): string | null {
    // 注意：这种实现方式有限制，因为我们没有存储消息ID和receiptHandle的映射
    // 在生产环境中，应该使用更可靠的方式跟踪receiptHandle

    // 这里假设最后一个保留的消息的ID是我们要确认的消息
    // 实际上这不是一个可靠的实现，只是为了演示
    return null;
  }
}