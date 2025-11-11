/**
 * 作业管理
 * 负责跟踪和管理处理作业
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { storage } from './storage';
import { ensureDir } from './server-utils';

// 数据目录 - 使用绝对路径确保在任何工作目录下都能正确访问
const DATA_DIR = (() => {
  // 优先使用环境变量，否则使用相对于 frontend 的路径
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  // 默认使用 process.cwd()/data
  return path.join(process.cwd(), 'data');
})();
// 作业记录文件
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

// 作业状态类型
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 作业信息接口
export interface JobInfo {
  id: string;
  status: JobStatus;
  message: string;
  platform: string;
  userId: string;
  uploadId: string;
  datasetId: string;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  progress?: number; // 0-100
  fileObjects?: Record<string, string>;
  metadata?: Record<string, any>;
}

// 作业创建参数接口
export interface CreateJobParams {
  id?: string;
  platform: string;
  userId: string;
  uploadId: string;
  datasetId: string;
  year: number;
  month: number;
  fileObjects?: Record<string, string>;
  metadata?: Record<string, any>;
}

// 作业更新参数接口
export interface UpdateJobParams {
  status: JobStatus;
  message: string;
  progress?: number;
  metadata?: Record<string, any>;
}

// 内存缓存
let jobsCache: JobInfo[] | null = null;

/**
 * 初始化作业记录文件
 */
async function initJobsFile(): Promise<void> {
  await ensureDir(DATA_DIR);

  try {
    await fs.access(JOBS_FILE);
  } catch (err) {
    // 文件不存在，创建空记录
    await fs.writeFile(JOBS_FILE, JSON.stringify([]));
  }
}

/**
 * 获取所有作业
 * @returns 作业数组
 *
 * 注意：禁用缓存以支持多进程（Next.js + Worker）环境
 * 每次调用都重新读取文件，确保跨进程数据一致性
 */
async function getJobs(): Promise<JobInfo[]> {
  // 多进程环境下禁用缓存，总是读取最新文件内容
  // if (jobsCache !== null) {
  //   return jobsCache;
  // }

  await initJobsFile();

  try {
    const data = await fs.readFile(JOBS_FILE, 'utf-8');
    const jobs = JSON.parse(data);
    // 不更新缓存，避免跨进程不一致
    // jobsCache = jobs;
    return jobs;
  } catch (err) {
    console.error('读取作业记录失败:', err);
    return [];
  }
}

/**
 * 保存作业
 * @param jobs 作业数组
 */
async function saveJobs(jobs: JobInfo[]): Promise<void> {
  await initJobsFile();

  try {
    console.log('[jobs.saveJobs] 保存 ' + jobs.length + ' 个作业到 ' + JOBS_FILE);
    console.log('[jobs.saveJobs] DATA_DIR=' + DATA_DIR + ', cwd=' + process.cwd());
    await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
    jobsCache = jobs;
    console.log('[jobs.saveJobs] 保存成功');
  } catch (err) {
    console.error('[jobs.saveJobs] 保存作业记录失败:', err);
    throw err;
  }
}

/**
 * 创建作业
 * @param params 作业创建参数
 * @returns 作业信息
 */
export async function createJob(params: CreateJobParams): Promise<JobInfo> {
  const jobs = await getJobs();

  const now = new Date().toISOString();
  const jobId = params.id || `job-${uuidv4()}`;

  const job: JobInfo = {
    id: jobId,
    status: 'pending',
    message: '等待处理',
    platform: params.platform,
    userId: params.userId,
    uploadId: params.uploadId,
    datasetId: params.datasetId,
    year: params.year,
    month: params.month,
    createdAt: now,
    updatedAt: now,
    progress: 0,
    fileObjects: params.fileObjects,
    metadata: params.metadata
  };

  jobs.push(job);
  await saveJobs(jobs);

  return job;
}

/**
 * 获取作业信息
 * @param jobId 作业ID
 * @returns 作业信息或null
 */
export async function getJobInfo(jobId: string): Promise<JobInfo | null> {
  const jobs = await getJobs();
  return jobs.find(job => job.id === jobId) || null;
}

/**
 * 更新作业状态
 * @param jobId 作业ID
 * @param params 更新参数
 * @returns 更新后的作业信息或null
 */
export async function updateJob(
  jobId: string,
  params: UpdateJobParams
): Promise<JobInfo | null> {
  const jobs = await getJobs();
  const index = jobs.findIndex(job => job.id === jobId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const job = jobs[index];

  // 更新字段
  job.status = params.status;
  job.message = params.message;
  job.updatedAt = now;

  if (params.progress !== undefined) {
    job.progress = params.progress;
  }

  if (params.metadata) {
    job.metadata = { ...job.metadata || {}, ...params.metadata };
  }

  if (params.status === 'completed') {
    job.completedAt = now;
  }

  jobs[index] = job;
  await saveJobs(jobs);

  return job;
}

/**
 * 获取用户的作业
 * @param userId 用户ID
 * @param limit 限制数量
 * @param offset 偏移量
 * @returns 作业数组
 */
export async function getUserJobs(
  userId: string,
  limit?: number,
  offset?: number
): Promise<JobInfo[]> {
  const jobs = await getJobs();

  // 过滤用户的作业
  const userJobs = jobs.filter(job => job.userId === userId);

  // 按创建时间倒序排序
  userJobs.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // 应用分页
  if (offset !== undefined && limit !== undefined) {
    return userJobs.slice(offset, offset + limit);
  } else if (limit !== undefined) {
    return userJobs.slice(0, limit);
  }

  return userJobs;
}

/**
 * 获取数据集作业
 * @param datasetId 数据集ID
 * @returns 作业数组
 */
export async function getDatasetJobs(datasetId: string): Promise<JobInfo[]> {
  const jobs = await getJobs();

  // 过滤数据集的作业
  return jobs.filter(job => job.datasetId === datasetId);
}

/**
 * 删除作业
 * @param jobId 作业ID
 * @returns 是否成功
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  const jobs = await getJobs();
  const index = jobs.findIndex(job => job.id === jobId);

  if (index === -1) {
    return false;
  }

  jobs.splice(index, 1);
  await saveJobs(jobs);

  return true;
}
