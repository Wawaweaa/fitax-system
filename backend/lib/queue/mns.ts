/**
 * 阿里云 MNS 队列驱动
 * 适用于阿里云消息服务
 */
import axios from 'axios';
import { createHash, createHmac } from 'crypto';
import { nanoid } from 'nanoid';
import { Queue, Payload, Job, EnqueueOptions, ReserveOptions } from './base';
import { config } from '../config';

// MNS 消息结构
interface MNSMessage {
  MessageId: string;
  ReceiptHandle: string;
  MessageBody: string;
  MessageBodyMD5: string;
  EnqueueTime: number;
  FirstDequeueTime: number;
  DequeueCount: number;
  Priority: number;
}

export class MNSQueue extends Queue {
  private endpoint: string;
  private accessKeyId: string;
  private accessKeySecret: string;
  private queueName: string;

  constructor() {
    super();

    const { url, queueName, accessKey, secretKey } = config().queue;

    if (!url) {
      throw new Error('MNS endpoint URL is required');
    }

    if (!accessKey || !secretKey) {
      throw new Error('MNS requires accessKey and secretKey');
    }

    this.endpoint = url;
    this.accessKeyId = accessKey;
    this.accessKeySecret = secretKey;
    this.queueName = queueName || 'fitax-jobs';
  }

  /**
   * 将任务添加到队列
   * @param payload 任务负载
   * @param opts 入队选项
   * @returns 任务ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    const id = nanoid();

    // 确保 jobId 是唯一的
    payload.jobId = payload.jobId || id;

    const messageBody = JSON.stringify(payload);

    const headers = this.generateHeaders('POST', `/queues/${this.queueName}/messages`);

    // 构建消息请求体
    const requestBody = {
      MessageBody: messageBody,
      Priority: opts?.priority ?? 8, // MNS 优先级范围 1-16，数字越小优先级越高
      DelaySeconds: opts?.delay ?? 0,
    };

    try {
      const response = await axios.post(
        `${this.endpoint}/queues/${this.queueName}/messages`,
        requestBody,
        { headers }
      );

      // 如果请求成功，MNS 会返回一个包含 MessageId 的响应
      if (response.data && response.data.MessageId) {
        return id;
      } else {
        throw new Error('Failed to enqueue message to MNS');
      }
    } catch (error) {
      console.error('Error enqueueing message to MNS:', error);
      throw error;
    }
  }

  /**
   * 从队列获取一个任务
   * @param opts 出队选项
   * @returns 任务对象或null（如果队列为空）
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const path = `/queues/${this.queueName}/messages`;
    const headers = this.generateHeaders('GET', path, {
      'x-mns-wait-seconds': String(opts?.timeout || 1),
    });

    try {
      const response = await axios.get(
        `${this.endpoint}${path}`,
        { headers }
      );

      // 如果队列为空，MNS 会返回空响应
      if (!response.data || !response.data.Message) {
        return null;
      }

      const message = response.data.Message as MNSMessage;
      const receiptHandle = message.ReceiptHandle;

      if (!message.MessageBody) {
        // 如果消息格式不正确，则删除并跳过
        await this.ackMessage(receiptHandle);
        return null;
      }

      // 解析负载
      let payload: Payload;
      try {
        payload = JSON.parse(message.MessageBody);
      } catch (err) {
        // 如果负载解析失败，则删除并跳过
        await this.ackMessage(receiptHandle);
        return null;
      }

      // 为消息添加 receiptHandle，用于稍后确认或失败
      (payload as any)._receiptHandle = receiptHandle;

      // 返回任务
      return {
        id: payload.jobId || nanoid(),
        payload,
        receivedAt: new Date(),
      };
    } catch (error) {
      console.error('Error reserving message from MNS:', error);
      return null;
    }
  }

  /**
   * 确认任务已完成
   * @param id 任务ID
   */
  async ack(id: string): Promise<void> {
    // 获取上次预留的任务
    const job = await this.getLastReservedJob(id);

    if (!job) {
      return;
    }

    const receiptHandle = (job.payload as any)._receiptHandle;

    if (receiptHandle) {
      await this.ackMessage(receiptHandle);
    }
  }

  /**
   * 删除消息（确认）
   * @param receiptHandle 消息回执句柄
   */
  private async ackMessage(receiptHandle: string): Promise<void> {
    const path = `/queues/${this.queueName}/messages?ReceiptHandle=${encodeURIComponent(receiptHandle)}`;
    const headers = this.generateHeaders('DELETE', path);

    try {
      await axios.delete(`${this.endpoint}${path}`, { headers });
    } catch (error) {
      console.error('Error acknowledging MNS message:', error);
      throw error;
    }
  }

  /**
   * 标记任务为失败
   * @param id 任务ID
   * @param err 错误信息
   */
  async fail(id: string, err: Error): Promise<void> {
    // 获取上次预留的任务
    const job = await this.getLastReservedJob(id);

    if (!job) {
      return;
    }

    const receiptHandle = (job.payload as any)._receiptHandle;

    if (receiptHandle) {
      // 添加错误信息
      job.payload.error = err.message;
      job.payload.errorStack = err.stack;
      job.payload.failedAt = new Date().toISOString();

      // 发送到死信队列（如果配置了死信队列）
      try {
        await this.enqueueToDeadLetter(job.payload);
      } catch (error) {
        console.error('Error sending failed job to dead letter queue:', error);
      }

      // 确认原消息
      await this.ackMessage(receiptHandle);
    }
  }

  /**
   * 将失败任务发送到死信队列
   * @param payload 任务负载
   */
  private async enqueueToDeadLetter(payload: Payload): Promise<void> {
    const deadLetterQueueName = `${this.queueName}-dead-letter`;

    const path = `/queues/${deadLetterQueueName}/messages`;
    const headers = this.generateHeaders('POST', path);

    const requestBody = {
      MessageBody: JSON.stringify(payload),
      Priority: 8,
    };

    try {
      await axios.post(
        `${this.endpoint}${path}`,
        requestBody,
        { headers }
      );
    } catch (error) {
      console.error('Error enqueueing message to MNS dead letter queue:', error);
      throw error;
    }
  }

  /**
   * 获取队列长度
   * @returns 队列中待处理的任务数
   */
  async size(): Promise<number> {
    const path = `/queues/${this.queueName}?metaoverride=true`;
    const headers = this.generateHeaders('GET', path);

    try {
      const response = await axios.get(
        `${this.endpoint}${path}`,
        { headers }
      );

      if (response.data && response.data.Queue) {
        return parseInt(response.data.Queue.ActiveMessages || '0', 10);
      }

      return 0;
    } catch (error) {
      console.error('Error getting MNS queue size:', error);
      return 0;
    }
  }

  /**
   * 生成 MNS API 请求头
   * @param method HTTP 方法
   * @param path 请求路径
   * @param additionalHeaders 额外的请求头
   * @returns 请求头
   */
  private generateHeaders(method: string, path: string, additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const date = new Date().toUTCString();
    const contentMD5 = '';
    const contentType = 'application/json';

    // 构建规范化的 MNS 请求
    const canonicalizedMNSHeaders = Object.entries(additionalHeaders)
      .filter(([key]) => key.toLowerCase().startsWith('x-mns-'))
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => `${key.toLowerCase()}:${value}`)
      .join('\n');

    // 构建签名字符串
    const stringToSign = [
      method,
      contentMD5,
      contentType,
      date,
      canonicalizedMNSHeaders ? `${canonicalizedMNSHeaders}\n` : '',
      path,
    ].join('\n');

    // 计算 HMAC-SHA1 签名
    const signature = createHmac('sha1', this.accessKeySecret)
      .update(stringToSign)
      .digest('base64');

    return {
      'Authorization': `MNS ${this.accessKeyId}:${signature}`,
      'Date': date,
      'Content-Type': contentType,
      'x-mns-version': '2015-06-06',
      ...additionalHeaders,
    };
  }

  /**
   * 模拟获取上次预留的任务（简化实现，实际应用中通常通过内存缓存实现）
   * @param id 任务ID
   */
  private async getLastReservedJob(id: string): Promise<Job | null> {
    // 由于 MNS 不支持按 ID 获取消息，我们将返回 null
    // 这意味着 ack() 和 fail() 方法必须在 reserve() 的回调中立即调用
    return null;
  }
}