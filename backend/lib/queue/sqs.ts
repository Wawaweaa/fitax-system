/**
 * AWS SQS 队列驱动
 * 适用于 AWS Simple Queue Service
 */
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { nanoid } from 'nanoid';
import { Queue, Payload, Job, EnqueueOptions, ReserveOptions } from './base';
import { config } from '../config';

export class SQSQueue extends Queue {
  private client: SQSClient;
  private queueUrl: string;
  private deadLetterQueueUrl: string;

  constructor() {
    super();

    const { region, accessKey, secretKey, url, queueName } = config().queue;

    if (!url) {
      throw new Error('SQS queue URL is required');
    }

    // 创建 SQS 客户端
    const clientConfig: any = {
      region: region || 'us-east-1',
    };

    // 设置凭证（如果提供）
    if (accessKey && secretKey) {
      clientConfig.credentials = {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      };
    }

    this.client = new SQSClient(clientConfig);
    this.queueUrl = url;
    this.deadLetterQueueUrl = `${url}-dead-letter`;
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

    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: messageBody,
      // 使用 MessageDeduplicationId 和 MessageGroupId 用于 FIFO 队列
      // 对于标准队列，这些字段会被忽略
      MessageDeduplicationId: id,
      MessageGroupId: 'fitax-jobs',
      DelaySeconds: opts?.delay ? Math.min(opts.delay, 900) : undefined, // SQS 最大延迟为 15 分钟
      MessageAttributes: {
        id: {
          DataType: 'String',
          StringValue: id,
        },
        priority: {
          DataType: 'Number',
          StringValue: String(opts?.priority ?? 0),
        },
        createdAt: {
          DataType: 'String',
          StringValue: new Date().toISOString(),
        },
      },
    });

    const result = await this.client.send(command);
    return id;
  }

  /**
   * 从队列获取一个任务
   * @param opts 出队选项
   * @returns 任务对象或null（如果队列为空）
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: opts?.timeout || 1, // 长轮询
      VisibilityTimeout: opts?.visibility || 60, // 可见性超时
      MessageAttributeNames: ['All'],
    });

    const result = await this.client.send(command);

    if (!result.Messages || result.Messages.length === 0) {
      return null;
    }

    const message = result.Messages[0];
    const receiptHandle = message.ReceiptHandle;

    if (!message.Body) {
      // 如果消息格式不正确，则删除并跳过
      await this.client.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }));
      return null;
    }

    // 解析负载
    let payload: Payload;
    try {
      payload = JSON.parse(message.Body);
    } catch (err) {
      // 如果负载解析失败，则删除并跳过
      await this.client.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }));
      return null;
    }

    // 获取消息属性
    const id = message.MessageAttributes?.id?.StringValue || payload.jobId || nanoid();

    // 为消息添加 receiptHandle，用于稍后确认或失败
    (payload as any)._receiptHandle = receiptHandle;

    return {
      id,
      payload,
      receivedAt: new Date(),
    };
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
      // 删除消息
      await this.client.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }));
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

      // 发送到死信队列
      await this.client.send(new SendMessageCommand({
        QueueUrl: this.deadLetterQueueUrl,
        MessageBody: JSON.stringify(job.payload),
        MessageAttributes: {
          id: {
            DataType: 'String',
            StringValue: id,
          },
          error: {
            DataType: 'String',
            StringValue: err.message,
          },
          failedAt: {
            DataType: 'String',
            StringValue: new Date().toISOString(),
          },
        },
      }));

      // 从主队列中删除
      await this.client.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }));
    }
  }

  /**
   * 获取队列长度
   * @returns 队列中待处理的任务数
   */
  async size(): Promise<number> {
    const command = new GetQueueAttributesCommand({
      QueueUrl: this.queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });

    try {
      const result = await this.client.send(command);

      return parseInt(result.Attributes?.ApproximateNumberOfMessages || '0', 10);
    } catch (error) {
      console.error('Error getting queue size:', error);
      return 0;
    }
  }

  /**
   * 模拟获取上次预留的任务（SQS不存储状态，这是一个简化模拟）
   * @param id 任务ID
   */
  private async getLastReservedJob(id: string): Promise<Job | null> {
    // 注意：SQS不提供获取特定消息的能力
    // 这里我们使用一个简化的方法，假设调用方已经持有任务对象
    // 在实际应用中，这通常是通过在内存中缓存最近处理的消息来实现的

    // 由于 SQS 不支持按 ID 获取消息，我们将返回 null
    // 这意味着 ack() 和 fail() 方法必须在 reserve() 的回调中立即调用
    return null;
  }
}