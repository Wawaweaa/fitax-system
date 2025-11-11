/**
 * 基于文件系统的队列驱动
 * 用于本地开发环境，支持多进程间通信（Web + Worker）
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Queue, Payload, EnqueueOptions, ReserveOptions, Job } from './base';
import { ensureDir } from '../server-utils';

// 队列目录
const QUEUE_DIR = path.join(process.cwd(), 'data', 'queue');
const PENDING_DIR = path.join(QUEUE_DIR, 'pending');
const PROCESSING_DIR = path.join(QUEUE_DIR, 'processing');
const COMPLETED_DIR = path.join(QUEUE_DIR, 'completed');
const FAILED_DIR = path.join(QUEUE_DIR, 'failed');

// 消息文件接口
interface FileMessage {
  id: string;
  payload: Payload;
  enqueueAt: number;
  reservedUntil?: number;
}

/**
 * 基于文件的队列驱动
 * 每个消息存储为一个 JSON 文件
 */
export class FileQueue extends Queue {
  private initialized = false;

  /**
   * 初始化队列目录
   */
  private async init(): Promise<void> {
    if (this.initialized) return;

    await ensureDir(QUEUE_DIR);
    await ensureDir(PENDING_DIR);
    await ensureDir(PROCESSING_DIR);
    await ensureDir(COMPLETED_DIR);
    await ensureDir(FAILED_DIR);

    this.initialized = true;
  }

  /**
   * 将消息加入队列
   * @param payload 消息负载
   * @param opts 入队选项
   * @returns 消息ID
   */
  async enqueue(payload: Payload, opts?: EnqueueOptions): Promise<string> {
    await this.init();

    const id = uuidv4();
    const message: FileMessage = {
      id,
      payload,
      enqueueAt: Date.now(),
    };

    // 如果有延迟，设置 reservedUntil
    if (opts?.delaySeconds && opts.delaySeconds > 0) {
      message.reservedUntil = Date.now() + opts.delaySeconds * 1000;
    }

    // 写入待处理目录
    const filePath = path.join(PENDING_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(message, null, 2));

    console.log(`[FileQueue] 消息入队: ${id}`);
    try {
      const jobId = (payload as any)?.jobId || (payload as any)?.payload?.jobId;
      console.log('[queue-debug] enqueue', { messageId: id, jobId });
    } catch {}
    return id;
  }

  /**
   * 从队列中预留消息
   * @param opts 预留选项
   * @returns 作业或null
   */
  async reserve(opts?: ReserveOptions): Promise<Job | null> {
    await this.init();

    const now = Date.now();

    // 读取 pending 目录中的所有消息
    const files = await fs.readdir(PENDING_DIR);

    // 按文件名排序（时间顺序）
    files.sort();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(PENDING_DIR, file);

      try {
        // 读取消息
        const content = await fs.readFile(filePath, 'utf-8');
        const message: FileMessage = JSON.parse(content);

        // 检查是否可以处理（延迟消息）
        if (message.reservedUntil && message.reservedUntil > now) {
          continue;
        }

        // 移动到 processing 目录（原子性）
        const processingPath = path.join(PROCESSING_DIR, file);

        try {
          // 尝试重命名（移动文件）
          await fs.rename(filePath, processingPath);
        } catch (err: any) {
          // 文件可能已被其他进程处理
          if (err.code === 'ENOENT') {
            continue;
          }
          throw err;
        }

        // 更新 reservedUntil
        const timeout = opts?.timeout || 60; // 默认 60 秒
        message.reservedUntil = now + timeout * 1000;
        await fs.writeFile(processingPath, JSON.stringify(message, null, 2));

        console.log(`[FileQueue] 消息预留: ${message.id}`);
        try {
          const jobId = (message.payload as any)?.jobId || (message as any)?.payload?.jobId;
          console.log('[queue-debug] reserve', { messageId: message.id, jobId, workerPid: process.pid });
        } catch {}
        return {
          id: message.id,
          payload: message.payload,
        };
      } catch (err: any) {
        // 跳过损坏的文件
        console.error(`[FileQueue] 读取消息失败: ${file}`, err);
        continue;
      }
    }

    return null;
  }

  /**
   * 确认消息已处理
   * @param id 消息ID
   */
  async ack(id: string): Promise<void> {
    await this.init();

    const processingPath = path.join(PROCESSING_DIR, `${id}.json`);
    const completedPath = path.join(COMPLETED_DIR, `${id}.json`);

    try {
      await fs.rename(processingPath, completedPath);
      console.log(`[FileQueue] 消息确认: ${id}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`[FileQueue] 确认消息失败: ${id}`, err);
      }
    }
  }

  /**
   * 标记消息处理失败
   * @param id 消息ID
   * @param err 错误
   */
  async fail(id: string, err: Error): Promise<void> {
    await this.init();

    const processingPath = path.join(PROCESSING_DIR, `${id}.json`);
    const failedPath = path.join(FAILED_DIR, `${id}.json`);

    try {
      // 读取消息并添加错误信息
      const content = await fs.readFile(processingPath, 'utf-8');
      const message: FileMessage & { error?: string; failedAt?: number } = JSON.parse(content);
      message.error = err.message;
      message.failedAt = Date.now();

      await fs.writeFile(failedPath, JSON.stringify(message, null, 2));
      await fs.unlink(processingPath);

      console.log(`[FileQueue] 消息失败: ${id}`, err.message);
    } catch (fileErr: any) {
      if (fileErr.code !== 'ENOENT') {
        console.error(`[FileQueue] 标记失败消息失败: ${id}`, fileErr);
      }
    }
  }

  /**
   * 获取队列大小
   * @returns 队列中的消息数量
   */
  async size(): Promise<number> {
    await this.init();

    const files = await fs.readdir(PENDING_DIR);
    return files.filter(f => f.endsWith('.json')).length;
  }

  /**
   * 清理已完成和失败的消息（维护工具）
   */
  async cleanup(): Promise<void> {
    await this.init();

    const completedFiles = await fs.readdir(COMPLETED_DIR);
    const failedFiles = await fs.readdir(FAILED_DIR);

    for (const file of completedFiles) {
      await fs.unlink(path.join(COMPLETED_DIR, file));
    }

    for (const file of failedFiles) {
      await fs.unlink(path.join(FAILED_DIR, file));
    }

    console.log(`[FileQueue] 清理完成: ${completedFiles.length} completed, ${failedFiles.length} failed`);
  }
}
