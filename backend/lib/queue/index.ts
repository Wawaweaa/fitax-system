/**
 * 队列驱动工厂
 */
import { Queue } from './base';
import { LocalQueue } from './local';
import { RedisQueue } from './redis';
import { SQSQueue } from './sqs';
import { MNSQueue } from './mns';
import { config } from '../config';

/**
 * 创建队列驱动实例
 * @returns Queue 实例
 */
export function createQueue(): Queue {
  const queueDriver = config().queue.driver;

  switch (queueDriver) {
    case 'local':
      return new LocalQueue();
    case 'redis':
      return new RedisQueue();
    case 'sqs':
      return new SQSQueue();
    case 'mns':
      return new MNSQueue();
    default:
      throw new Error(`Unsupported queue driver: ${queueDriver}`);
  }
}

// 导出 Queue 抽象类和各驱动类型
export * from './base';
export * from './local';
export * from './redis';
export * from './sqs';
export * from './mns';

// 队列驱动单例
let queueInstance: Queue | null = null;

/**
 * 获取队列驱动单例
 * @returns Queue 单例
 */
export function queue(): Queue {
  if (!queueInstance) {
    queueInstance = createQueue();
  }
  return queueInstance;
}

/**
 * 重置队列驱动单例（用于测试）
 */
export function resetQueue(): void {
  queueInstance = null;
}