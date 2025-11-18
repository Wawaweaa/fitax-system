/**
 * 作业状态管理
 * 提供持久化的作业跟踪与状态管理
 */
import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { storage } from './storage';
import { config } from './config';
import { ensureDir } from './utils';

// 作业状态
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 作业详情
export interface Job {
  id: string;
  platform: string;
  uploadId: string;
  year: number;
  month: number;
  files: string[];
  status: JobStatus;
  message: string;
  progress?: number; // 0-100
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

// 作业创建参数
export interface CreateJobParams {
  platform: string;
  uploadId: string;
  year: number;
  month: number;
  files: string[];
  metadata?: Record<string, any>;
}

// 作业状态更新参数
interface JobStatusUpdate {
  status: JobStatus;
  message: string;
  progress?: number;
  metadata?: Record<string, any>;
}

// 作业存储目录
const JOBS_DIR = path.join(process.cwd(), 'data', 'jobs');

// 确保作业目录存在
(async () => {
  await ensureDir(JOBS_DIR);
})();

/**
 * 创建新作业
 * @param params 作业参数
 * @returns 作业对象
 */
export async function createJob(params: CreateJobParams): Promise<Job> {
  const now = new Date().toISOString();
  const jobId = params.id || nanoid();

  const job: Job = {
    id: jobId,
    platform: params.platform,
    uploadId: params.uploadId,
    year: params.year,
    month: params.month,
    files: params.files,
    status: 'pending',
    message: '等待处理',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    metadata: params.metadata || {},
  };

  // 保存作业信息
  await saveJobInfo(job);

  return job;
}

/**
 * 获取作业详情
 * @param jobId 作业ID
 * @returns 作业对象或null
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    // 构建存储路径
    const storageKey = `jobs/${jobId}/info.json`;
    const localPath = path.join(JOBS_DIR, `${jobId}.json`);

    let jobData: Buffer;

    // 根据存储驱动选择获取方式
    if (config().storage.driver === 'local') {
      try {
        jobData = await fs.readFile(localPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    } else {
      try {
        // 从对象存储获取
        jobData = await storage().getObject(storageKey);
      } catch (err) {
        // 对象不存在
        if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
          return null;
        }
        throw err;
      }
    }

    // 解析作业信息
    return JSON.parse(jobData.toString()) as Job;
  } catch (err) {
    console.error(`获取作业信息失败 (${jobId}):`, err);
    return null;
  }
}

/**
 * 更新作业状态
 * @param jobId 作业ID
 * @param status 新状态
 * @param message 状态消息
 * @param progress 进度（可选）
 * @param metadata 元数据（可选）
 * @returns 更新后的作业对象
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  message: string,
  progress?: number,
  metadata?: Record<string, any>
): Promise<Job | null> {
  // 获取当前作业信息
  const job = await getJob(jobId);
  if (!job) {
    console.warn(`尝试更新不存在的作业: ${jobId}`);
    return null;
  }

  // 更新字段
  job.status = status;
  job.message = message;
  job.updatedAt = new Date().toISOString();

  if (progress !== undefined) {
    job.progress = progress;
  }

  if (status === 'completed') {
    job.completedAt = new Date().toISOString();
  }

  if (metadata) {
    job.metadata = { ...job.metadata || {}, ...metadata };
  }

  // 保存更新
  await saveJobInfo(job);

  return job;
}

/**
 * 保存作业信息
 * @param job 作业信息
 */
async function saveJobInfo(job: Job): Promise<void> {
  const jobData = Buffer.from(JSON.stringify(job, null, 2));

  // 构建存储路径
  const storageKey = `jobs/${job.id}/info.json`;
  const localPath = path.join(JOBS_DIR, `${job.id}.json`);

  // 根据存储驱动选择保存方式
  if (config().storage.driver === 'local') {
    await fs.writeFile(localPath, jobData);
  } else {
    // 保存到对象存储
    await storage().putObject(storageKey, jobData, {
      contentType: 'application/json',
      metadata: {
        'job-id': job.id,
        'upload-id': job.uploadId,
        'platform': job.platform,
      }
    });
  }
}

/**
 * 获取所有作业
 * @param platform 平台筛选（可选）
 * @param limit 限制数量（可选）
 * @param offset 偏移量（可选）
 * @returns 作业列表
 */
export async function getAllJobs(
  platform?: string,
  limit?: number,
  offset?: number
): Promise<Job[]> {
  try {
    let jobIds: string[] = [];

    // 根据存储驱动选择获取方式
    if (config().storage.driver === 'local') {
      // 从本地文件系统获取
      const files = await fs.readdir(JOBS_DIR);
      jobIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } else {
      // 从对象存储获取
      const objects = await storage().list('jobs/');
      // 提取作业 ID
      jobIds = objects
        .filter(key => key.endsWith('/info.json'))
        .map(key => {
          const match = key.match(/jobs\/([^\/]+)\/info.json/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
    }

    // 获取作业信息
    const jobs: Job[] = [];
    for (const jobId of jobIds) {
      const job = await getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    // 按平台筛选
    let filteredJobs = jobs;
    if (platform) {
      filteredJobs = jobs.filter(job => job.platform === platform);
    }

    // 排序：最新的在前
    filteredJobs.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 分页
    if (offset !== undefined && limit !== undefined) {
      filteredJobs = filteredJobs.slice(offset, offset + limit);
    } else if (limit !== undefined) {
      filteredJobs = filteredJobs.slice(0, limit);
    }

    return filteredJobs;
  } catch (err) {
    console.error('列出作业失败:', err);
    return [];
  }
}

/**
 * 删除作业
 * @param jobId 作业ID
 * @returns 是否成功
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    // 构建存储路径
    const storageKey = `jobs/${jobId}/info.json`;
    const localPath = path.join(JOBS_DIR, `${jobId}.json`);

    // 根据存储驱动选择删除方式
    if (config().storage.driver === 'local') {
      try {
        await fs.unlink(localPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return false;
        }
        throw err;
      }
    } else {
      // 从对象存储删除
      try {
        // 获取所有相关对象
        const objects = await storage().list(`jobs/${jobId}/`);

        // 删除所有对象
        for (const objectKey of objects) {
          await storage().deleteObject(objectKey);
        }
      } catch (err) {
        // 对象不存在
        if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
          return false;
        }
        throw err;
      }
    }

    return true;
  } catch (err) {
    console.error(`删除作业失败 (${jobId}):`, err);
    return false;
  }
}