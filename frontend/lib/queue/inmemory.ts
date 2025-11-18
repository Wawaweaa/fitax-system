/**
 * 内存队列驱动
 * 用于开发环境，将消息存储在内存中
 */
import { v4 as uuidv4 } from 'uuid';
import { Queue, Payload, EnqueueOptions, ReserveOptions, Job } from './base';

// 消息状态
type MessageStatus = 'pending' | 'reserved' | 'completed' | 'failed';

// 内存中的消息
interface InMemoryMessage {
  id: string;
  payload: Payload;
  status: MessageStatus;
  reservedUntil?: number;
  error?: string;
}

/**
 * 内存队列驱动
 */
export class InMemoryQueue extends Queue {
  private messages: InMemoryMessage[] = [];

  /**
   * 将消息加入队列
   * @param payload 消息负载
   * @param opts 入队选项
   * @returns 消息ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    const id = uuidv4();

    // 创建消息
    const message: InMemoryMessage = {
      id,
      payload,
      status: 'pending',
    };

    // 如果有延迟，设置延迟时间
    if (opts?.delaySeconds && opts.delaySeconds > 0) {
      const delayUntil = Date.now() + opts.delaySeconds * 1000;
      message.reservedUntil = delayUntil;
    }

    // 添加到队列
    this.messages.push(message);

    return id;
  }

  /**
   * 从队列中预留消息
   * @param opts 预留选项
   * @returns 作业或null
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const now = Date.now();

    // 查找未预留的消息
    const index = this.messages.findIndex(message =>
      message.status === 'pending' &&
      (!message.reservedUntil || message.reservedUntil <= now)
    );

    if (index === -1) {
      return null;
    }

    // 获取消息
    const message = this.messages[index];

    // 计算预留时间
    const timeout = opts?.timeout || 60; // 默认 60 秒
    const reservedUntil = now + timeout * 1000;

    // 更新消息状态
    message.status = 'reserved';
    message.reservedUntil = reservedUntil;

    return {
      id: message.id,
      payload: message.payload,
    };
  }

  /**
   * 确认消息已处理
   * @param id 消息ID
   */
  async ack(id: string): Promise<void> {
    const index = this.messages.findIndex(message => message.id === id);

    if (index !== -1) {
      this.messages[index].status = 'completed';
    }
  }

  /**
   * 标记消息处理失败
   * @param id 消息ID
   * @param err 错误
   */
  async fail(id: string, err: Error): Promise<void> {
    const index = this.messages.findIndex(message => message.id === id);

    if (index !== -1) {
      this.messages[index].status = 'failed';
      this.messages[index].error = err.message;
    }
  }

  /**
   * 获取队列大小
   * @returns 队列中的消息数量
   */
  async size(): Promise<number> {
    return this.messages.filter(message => message.status === 'pending').length;
  }

  /**
   * 清理已完成或失败的消息（仅用于测试）
   */
  async cleanup(): Promise<void> {
    this.messages = this.messages.filter(
      message => message.status !== 'completed' && message.status !== 'failed'
    );
  }

  /**
   * 获取所有消息（仅用于测试）
   * @returns 所有消息
   */
  getAll(): InMemoryMessage[] {
    return [...this.messages];
  }

  /**
   * 清空队列（仅用于测试）
   */
  clear(): void {
    this.messages = [];
  }
}