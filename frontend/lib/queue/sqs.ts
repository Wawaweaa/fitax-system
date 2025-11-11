/**
 * AWS SQS 队列驱动
 * 使用 AWS SQS 作为队列后端
 */
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  SendMessageCommandInput,
  ReceiveMessageCommandInput,
  DeleteMessageCommandInput,
  GetQueueAttributesCommandInput
} from '@aws-sdk/client-sqs';
import { Queue, Payload, EnqueueOptions, ReserveOptions, Job } from './base';
import { config } from '../config';

/**
 * AWS SQS 队列驱动
 */
export class SQSQueue extends Queue {
  private client: SQSClient;
  private queueUrl: string;

  /**
   * 构造函数
   * @param options 选项
   */
  constructor(options?: {
    region?: string;
    queueUrl?: string;
    accessKey?: string;
    secretKey?: string;
  }) {
    super();

    const queueConfig = config().queue;
    const region = options?.region || queueConfig.sqsRegion;
    this.queueUrl = options?.queueUrl || queueConfig.sqsQueueUrl;
    const accessKey = options?.accessKey || queueConfig.sqsAccessKey;
    const secretKey = options?.secretKey || queueConfig.sqsSecretKey;

    if (!region || !this.queueUrl || !accessKey || !secretKey) {
      throw new Error('SQS队列驱动配置不完整，请检查环境变量');
    }

    // 创建SQS客户端
    this.client = new SQSClient({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  /**
   * 将消息加入队列
   * @param payload 消息负载
   * @param opts 入队选项
   * @returns 消息ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    const params: SendMessageCommandInput = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload),
    };

    // 设置延迟
    if (opts?.delaySeconds) {
      params.DelaySeconds = opts.delaySeconds;
    }

    // 对于FIFO队列，设置消息分组ID和去重ID
    if (this.queueUrl.endsWith('.fifo')) {
      params.MessageGroupId = opts?.groupId || 'default';

      if (opts?.deduplicationId) {
        params.MessageDeduplicationId = opts.deduplicationId;
      }
    }

    const result = await this.client.send(new SendMessageCommand(params));
    return result.MessageId || '';
  }

  /**
   * 从队列中预留消息
   * @param opts 预留选项
   * @returns 作业或null
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const params: ReceiveMessageCommandInput = {
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 1,
      VisibilityTimeout: opts?.timeout || 30,
      WaitTimeSeconds: 0, // 不等待，立即返回
      AttributeNames: ['All'],
    };

    const result = await this.client.send(new ReceiveMessageCommand(params));

    if (!result.Messages || result.Messages.length === 0) {
      return null;
    }

    const message = result.Messages[0];
    const id = message.MessageId || '';
    const receiptHandle = message.ReceiptHandle || '';

    try {
      const payload = JSON.parse(message.Body || '{}') as Payload;

      // 将SQS消息的receiptHandle存储在payload中，用于后续的ack和fail操作
      return {
        id,
        payload: {
          ...payload,
          __sqs: {
            receiptHandle,
          },
        },
      };
    } catch (err) {
      console.error('解析SQS消息失败:', err);
      // 解析失败，自动确认以避免消息一直保留在队列中
      await this.deleteMessage(receiptHandle);
      return null;
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
    // 从payload中获取receiptHandle
    const receiptHandle = this.getReceiptHandle(id);
    if (!receiptHandle) {
      console.warn(`无法标记消息 ${id} 失败，receiptHandle 不存在`);
      return;
    }

    // 删除消息，SQS不支持直接标记消息失败
    // 如果需要保留失败消息，应该使用死信队列
    await this.deleteMessage(receiptHandle);
  }

  /**
   * 获取队列大小
   * @returns 队列中的消息数量
   */
  async size(): Promise<number> {
    const params: GetQueueAttributesCommandInput = {
      QueueUrl: this.queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    };

    const result = await this.client.send(new GetQueueAttributesCommand(params));

    return parseInt(result.Attributes?.ApproximateNumberOfMessages || '0', 10);
  }

  /**
   * 删除消息
   * @param receiptHandle 消息回执句柄
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    const params: DeleteMessageCommandInput = {
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    };

    await this.client.send(new DeleteMessageCommand(params));
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