/**
 * 队列抽象基类
 * 定义了所有队列驱动必须实现的接口
 */

/**
 * 队列负载
 * 可以是任意可序列化的对象
 */
export interface Payload {
  [key: string]: any;
}

/**
 * 入队选项
 */
export interface EnqueueOptions {
  /**
   * 延迟执行时间（秒）
   */
  delaySeconds?: number;

  /**
   * 消息组ID（用于FIFO队列）
   */
  groupId?: string;

  /**
   * 消息重复数据删除ID（用于FIFO队列）
   */
  deduplicationId?: string;
}

/**
 * 预留选项
 */
export interface ReserveOptions {
  /**
   * 等待超时（秒）
   */
  timeout?: number;

  /**
   * 获取消息数量
   */
  count?: number;
}

/**
 * 作业
 */
export interface Job {
  /**
   * 作业ID
   */
  id: string;

  /**
   * 作业负载
   */
  payload: Payload;
}

/**
 * 队列抽象
 */
export abstract class Queue {
  /**
   * 将消息加入队列
   * @param payload 消息负载
   * @param opts 入队选项
   * @returns 消息ID
   */
  abstract enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string>;

  /**
   * 从队列中预留消息
   * @param opts 预留选项
   * @returns 作业或null
   */
  abstract reserve(opts?: ReserveOptions): Promise<Job | null>;

  /**
   * 确认消息已处理
   * @param id 消息ID
   */
  abstract ack(id: string): Promise<void>;

  /**
   * 标记消息处理失败
   * @param id 消息ID
   * @param err 错误
   */
  abstract fail(id: string, err: Error): Promise<void>;

  /**
   * 获取队列大小
   * @returns 队列中的消息数量
   */
  abstract size(): Promise<number>;
}