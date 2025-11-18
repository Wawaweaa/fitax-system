/**
 * 本地内存队列驱动
 * 用于开发环境
 */
import { nanoid } from 'nanoid';
import { Queue, Payload, Job, EnqueueOptions, ReserveOptions } from './base';

interface QueueItem {
  id: string;
  payload: Payload;
  createdAt: Date;
  availableAt: Date;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: Error;
}

export class LocalQueue extends Queue {
  private items: QueueItem[] = [];
  private processingItems: Map<string, QueueItem> = new Map();
  private processTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 将任务添加到队列
   * @param payload 任务负载
   * @param opts 入队选项
   * @returns 任务ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    const id = nanoid();
    const now = new Date();
    const delayMs = opts?.delay ? opts.delay * 1000 : 0;
    const availableAt = new Date(now.getTime() + delayMs);

    const item: QueueItem = {
      id,
      payload,
      createdAt: now,
      availableAt,
      priority: opts?.priority ?? 0,
      status: 'pending',
    };

    this.items.push(item);

    // 按照优先级和可用时间排序
    this.sortItems();

    return id;
  }

  /**
   * 从队列获取一个任务
   * @param opts 出队选项
   * @returns 任务对象或null（如果队列为空）
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    const now = new Date();

    // 查找第一个可用的任务
    const index = this.items.findIndex(item =>
      item.status === 'pending' && item.availableAt <= now
    );

    if (index === -1) {
      return null;
    }

    const item = this.items[index];

    // 更新状态
    item.status = 'processing';

    // 从待处理队列中移除
    this.items.splice(index, 1);

    // 添加到处理中队列
    this.processingItems.set(item.id, item);

    // 设置可见性超时
    const visibilityTimeoutMs = (opts?.visibility || 60) * 1000;
    const timeout = setTimeout(() => {
      // 如果任务超时未完成，将其放回队列
      if (this.processingItems.has(item.id)) {
        const timeoutItem = this.processingItems.get(item.id);
        this.processingItems.delete(item.id);
        timeoutItem.status = 'pending';
        this.items.push(timeoutItem);
        this.sortItems();
      }
      this.processTimeouts.delete(item.id);
    }, visibilityTimeoutMs);

    this.processTimeouts.set(item.id, timeout);

    // 返回任务
    return {
      id: item.id,
      payload: item.payload,
      receivedAt: now,
    };
  }

  /**
   * 确认任务已完成
   * @param id 任务ID
   */
  async ack(id: string): Promise<void> {
    // 清除超时计时器
    if (this.processTimeouts.has(id)) {
      clearTimeout(this.processTimeouts.get(id));
      this.processTimeouts.delete(id);
    }

    // 从处理中队列移除
    if (this.processingItems.has(id)) {
      const item = this.processingItems.get(id);
      item.status = 'completed';
      this.processingItems.delete(id);
    }
  }

  /**
   * 标记任务为失败
   * @param id 任务ID
   * @param err 错误信息
   */
  async fail(id: string, err: Error): Promise<void> {
    // 清除超时计时器
    if (this.processTimeouts.has(id)) {
      clearTimeout(this.processTimeouts.get(id));
      this.processTimeouts.delete(id);
    }

    // 从处理中队列移除，并标记为失败
    if (this.processingItems.has(id)) {
      const item = this.processingItems.get(id);
      item.status = 'failed';
      item.error = err;
      this.processingItems.delete(id);
    }
  }

  /**
   * 获取队列长度
   * @returns 队列中待处理的任务数
   */
  async size(): Promise<number> {
    return this.items.length;
  }

  /**
   * 按照优先级和可用时间排序
   */
  private sortItems(): void {
    this.items.sort((a, b) => {
      // 先按优先级排序（数字越小优先级越高）
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 再按可用时间排序
      return a.availableAt.getTime() - b.availableAt.getTime();
    });
  }

  /**
   * 清除队列中所有任务（用于测试）
   */
  clear(): void {
    this.items = [];

    // 清除所有处理中的任务
    for (const [id, timeout] of this.processTimeouts.entries()) {
      clearTimeout(timeout);
    }

    this.processingItems.clear();
    this.processTimeouts.clear();
  }
}