/**
 * Redis 队列驱动
 * 使用 Redis Streams 实现的队列系统，适用于 Upstash Redis
 */
import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { Queue, Payload, Job, EnqueueOptions, ReserveOptions } from './base';
import { config } from '../config';

export class RedisQueue extends Queue {
  private client: Redis;
  private streamKey: string;
  private processingKey: string;
  private consumerGroup: string;
  private consumerName: string;

  constructor() {
    super();

    const { url, queueName } = config().queue;

    if (!url) {
      throw new Error('Redis URL is required');
    }

    this.client = new Redis(url);
    this.streamKey = `${queueName || 'fitax-jobs'}-stream`;
    this.processingKey = `${queueName || 'fitax-jobs'}-processing`;
    this.consumerGroup = 'fitax-workers';
    this.consumerName = `worker-${nanoid(6)}`;

    // 初始化 Redis Streams 和消费者组
    this.initializeConsumerGroup();
  }

  /**
   * 初始化 Redis Streams 消费者组
   */
  private async initializeConsumerGroup(): Promise<void> {
    try {
      // 检查流是否存在
      const exists = await this.client.exists(this.streamKey);

      if (exists === 0) {
        // 创建一个空的流
        await this.client.xadd(this.streamKey, '*', 'init', 'true');
      }

      // 尝试创建消费者组，如果已存在则忽略错误
      try {
        await this.client.xgroup('CREATE', this.streamKey, this.consumerGroup, '0', 'MKSTREAM');
      } catch (err) {
        // 如果组已存在，则忽略错误
        if (!err.message.includes('BUSYGROUP')) {
          throw err;
        }
      }
    } catch (error) {
      console.error('Failed to initialize Redis consumer group:', error);
      throw error;
    }
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

    // 序列化负载
    const serializedPayload = JSON.stringify(payload);

    // 构建字段映射
    const fields: Record<string, string> = {
      id,
      payload: serializedPayload,
      priority: String(opts?.priority ?? 0),
      createdAt: Date.now().toString(),
    };

    // 如果有延迟，将任务添加到延迟集合
    if (opts?.delay && opts.delay > 0) {
      const processAt = Date.now() + (opts.delay * 1000);
      await this.client.zadd(`${this.streamKey}-delayed`, processAt, id);

      // 将任务存储在 Hash 中，以便稍后检索
      await this.client.hset(`${this.streamKey}-jobs:${id}`, fields);

      return id;
    }

    // 添加到流中
    await this.client.xadd(this.streamKey, '*', 'id', id, 'payload', serializedPayload,
      'priority', fields.priority, 'createdAt', fields.createdAt);

    return id;
  }

  /**
   * 从队列获取一个任务
   * @param opts 出队选项
   * @returns 任务对象或null（如果队列为空）
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    try {
      // 首先检查是否有延迟的任务需要处理
      await this.moveDelayedJobs();

      // 尝试从消费者组中读取
      const result = await this.client.xreadgroup(
        'GROUP', this.consumerGroup, this.consumerName,
        'COUNT', 1,
        'BLOCK', (opts?.timeout || 1) * 1000,
        'STREAMS', this.streamKey, '>'
      );

      // 如果没有新消息
      if (!result || result.length === 0 || result[0][1].length === 0) {
        return null;
      }

      const stream = result[0];
      const messages = stream[1];
      const message = messages[0];

      const streamId = message[0];
      const fields = message[1];

      // 解析消息
      const id = fields.find(f => f === 'id')
        ? fields[fields.indexOf('id') + 1]
        : null;

      const payloadStr = fields.find(f => f === 'payload')
        ? fields[fields.indexOf('payload') + 1]
        : null;

      if (!id || !payloadStr) {
        // 如果消息格式不正确，则确认并跳过
        await this.client.xack(this.streamKey, this.consumerGroup, streamId);
        return null;
      }

      // 解析负载
      let payload: Payload;
      try {
        payload = JSON.parse(payloadStr);
      } catch (err) {
        // 如果负载解析失败，则确认并跳过
        await this.client.xack(this.streamKey, this.consumerGroup, streamId);
        return null;
      }

      // 将消息 ID 存储到处理中的哈希表
      await this.client.hset(this.processingKey, id, streamId);

      // 设置可见性超时
      const visibilityTimeoutMs = (opts?.visibility || 60) * 1000;
      setTimeout(() => {
        this.handleVisibilityTimeout(id, streamId);
      }, visibilityTimeoutMs);

      // 返回任务
      return {
        id,
        payload,
        receivedAt: new Date(),
      };
    } catch (error) {
      console.error('Error in reserve:', error);
      return null;
    }
  }

  /**
   * 处理可见性超时
   * @param id 任务ID
   * @param streamId 流ID
   */
  private async handleVisibilityTimeout(id: string, streamId: string): Promise<void> {
    try {
      // 检查任务是否仍在处理中
      const stillProcessing = await this.client.hexists(this.processingKey, id);

      if (stillProcessing) {
        // 将任务重新加入队列
        const processingInfo = await this.client.hget(this.processingKey, id);

        if (processingInfo === streamId) {
          // 从处理中移除
          await this.client.hdel(this.processingKey, id);

          // 将任务重新添加到流（作为新消息）
          const streamMessage = await this.client.xclaim(
            this.streamKey,
            this.consumerGroup,
            this.consumerName,
            0,
            streamId
          );

          // 如果获取成功，则恢复消息到待处理状态
          if (streamMessage && streamMessage.length > 0) {
            const message = streamMessage[0];
            const fields = message[1];

            const payloadStr = fields.find(f => f === 'payload')
              ? fields[fields.indexOf('payload') + 1]
              : null;

            if (payloadStr) {
              await this.client.xadd(
                this.streamKey,
                '*',
                ...fields
              );

              // 确认原消息
              await this.client.xack(this.streamKey, this.consumerGroup, streamId);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in handleVisibilityTimeout:', error);
    }
  }

  /**
   * 将到期的延迟任务移到主队列
   */
  private async moveDelayedJobs(): Promise<void> {
    const now = Date.now();

    // 获取所有已到期的任务
    const expiredJobs = await this.client.zrangebyscore(
      `${this.streamKey}-delayed`,
      0,
      now
    );

    if (expiredJobs.length === 0) {
      return;
    }

    // 将任务添加到主队列
    for (const jobId of expiredJobs) {
      // 从哈希中获取任务详情
      const jobData = await this.client.hgetall(`${this.streamKey}-jobs:${jobId}`);

      if (jobData && jobData.payload) {
        // 添加到流中
        await this.client.xadd(
          this.streamKey,
          '*',
          'id', jobData.id,
          'payload', jobData.payload,
          'priority', jobData.priority || '0',
          'createdAt', jobData.createdAt || Date.now().toString()
        );

        // 从哈希和有序集中删除
        await this.client.zrem(`${this.streamKey}-delayed`, jobId);
        await this.client.del(`${this.streamKey}-jobs:${jobId}`);
      }
    }
  }

  /**
   * 确认任务已完成
   * @param id 任务ID
   */
  async ack(id: string): Promise<void> {
    try {
      // 获取流 ID
      const streamId = await this.client.hget(this.processingKey, id);

      if (streamId) {
        // 确认消息
        await this.client.xack(this.streamKey, this.consumerGroup, streamId);

        // 从处理中移除
        await this.client.hdel(this.processingKey, id);
      }
    } catch (error) {
      console.error('Error in ack:', error);
      throw error;
    }
  }

  /**
   * 标记任务为失败
   * @param id 任务ID
   * @param err 错误信息
   */
  async fail(id: string, err: Error): Promise<void> {
    try {
      // 获取流 ID
      const streamId = await this.client.hget(this.processingKey, id);

      if (streamId) {
        // 确认原消息
        await this.client.xack(this.streamKey, this.consumerGroup, streamId);

        // 获取原消息详情
        const result = await this.client.xrange(this.streamKey, streamId, streamId);

        if (result && result.length > 0) {
          const fields = result[0][1];

          // 解析负载
          const payloadStr = fields.find(f => f === 'payload')
            ? fields[fields.indexOf('payload') + 1]
            : null;

          if (payloadStr) {
            let payload: Payload;
            try {
              payload = JSON.parse(payloadStr);
            } catch (e) {
              payload = { jobId: id } as Payload;
            }

            // 添加错误信息
            payload.error = err.message;
            payload.errorStack = err.stack;
            payload.failedAt = new Date().toISOString();

            // 添加到失败队列
            await this.client.xadd(
              `${this.streamKey}-failed`,
              '*',
              'id', id,
              'payload', JSON.stringify(payload),
              'error', err.message,
              'failedAt', Date.now().toString()
            );
          }
        }

        // 从处理中移除
        await this.client.hdel(this.processingKey, id);
      }
    } catch (error) {
      console.error('Error in fail:', error);
      throw error;
    }
  }

  /**
   * 获取队列长度
   * @returns 队列中待处理的任务数
   */
  async size(): Promise<number> {
    try {
      // 获取流长度
      const streamInfo = await this.client.xinfo('STREAM', this.streamKey);
      const length = streamInfo.find((_, i) => i % 2 === 0 && streamInfo[i] === 'length');

      // 获取延迟任务数量
      const delayedCount = await this.client.zcard(`${this.streamKey}-delayed`);

      return (length ? parseInt(length[1], 10) : 0) + delayedCount;
    } catch (error) {
      console.error('Error in size:', error);
      return 0;
    }
  }
}