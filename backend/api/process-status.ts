/**
 * 数据处理状态 API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import { getJob } from '../lib/jobs';
import { apiSuccess, apiError } from '../lib/utils';

/**
 * 处理数据处理状态请求
 * @param req 请求对象
 * @param res 响应对象
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method Not Allowed', 405));
  }

  try {
    // 获取作业ID
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json(apiError('Job ID is required', 400));
    }

    // 获取作业状态
    const job = await getJob(jobId as string);

    if (!job) {
      return res.status(404).json(apiError(`Job not found: ${jobId}`, 404));
    }

    // 构建响应
    const response = {
      jobId: job.id,
      status: job.status,
      message: job.message,
      progress: job.progress || 0,
      platform: job.platform,
      uploadId: job.uploadId,
      year: job.year,
      month: job.month,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    // 添加额外信息，基于作业状态
    if (job.status === 'completed') {
      Object.assign(response, {
        completedAt: job.completedAt,
        factCount: job.metadata?.factCount,
        aggCount: job.metadata?.aggCount,
      });
    } else if (job.status === 'failed') {
      Object.assign(response, {
        error: job.metadata?.error || 'Unknown error',
      });
    }

    return res.status(200).json(apiSuccess(response));
  } catch (err) {
    console.error('Error getting job status:', err);
    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}