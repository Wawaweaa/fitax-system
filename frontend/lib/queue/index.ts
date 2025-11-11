/**
 * 队列模块
 * 根据配置创建相应的队列驱动
 */
import { Queue } from './base';
import { config } from '../config';

// 队列单例
let queueInstance: Queue | null = null;

/**
 * 获取队列驱动
 * @returns 队列驱动实例
 */
export function queue(): Queue {
  if (queueInstance) {
    return queueInstance;
  }

  const queueConfig = config().queue;

  // 根据配置创建相应的队列驱动
  switch (queueConfig.driver) {
    case 'inmemory':
      // 本地开发：使用基于文件的队列（支持多进程）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      queueInstance = new (require('./file').FileQueue)();
      console.log('[Queue] 使用 FileQueue（基于文件系统，支持多进程）');
      break;
    case 'sqs':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      queueInstance = new (require('./sqs').SQSQueue)();
      break;
    case 'mns':
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      queueInstance = new (require('./mns').MNSQueue)();
      break;
    default:
      throw new Error(`不支持的队列驱动: ${queueConfig.driver}`);
  }

  return queueInstance;
}

/**
 * 重置队列单例（仅用于测试）
 */
export function resetQueue(): void {
  queueInstance = null;
}

// 导出基础类型
export * from './base';
