/**
 * 队列抽象接口
 * 定义了所有队列驱动必须实现的方法
 */

// 任务负载类型
export interface Payload {
  jobId: string;
  platform: string;
  uploadId: string;
  year: number;
  month: number;
  files: string[];
  requestedBy?: string;
  requestedAt: string;
  [key: string]: any; // 允许其他字段
}

// 任务类型
export interface Job {
  id: string;
  payload: Payload;
  receivedAt: Date;
}

// 入队选项
export interface EnqueueOptions {
  delay?: number; // 延迟时间（秒）
  priority?: number; // 优先级（数字越小优先级越高）
}

// 出队选项
export interface ReserveOptions {
  timeout?: number; // 超时时间（秒）
  visibility?: number; // 可见性超时（秒）
}

// 队列抽象接口
export abstract class Queue {
  /**
   * 将任务添加到队列
   * @param payload 任务负载
   * @param opts 入队选项
   * @returns 任务ID
   */
  abstract enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string>;

  /**
   * 从队列获取一个任务
   * @param opts 出队选项
   * @returns 任务对象或null（如果队列为空）
   */
  abstract reserve(opts?: ReserveOptions): Promise<Job | null>;

  /**
   * 确认任务已完成
   * @param id 任务ID
   */
  abstract ack(id: string): Promise<void>;

  /**
   * 标记任务为失败
   * @param id 任务ID
   * @param err 错误信息
   */
  abstract fail(id: string, err: Error): Promise<void>;

  /**
   * 获取队列长度
   * @returns 队列中待处理的任务数
   */
  abstract size(): Promise<number>;
}