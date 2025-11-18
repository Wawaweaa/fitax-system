/**
 * 数据处理 API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs/promises';
import { queue } from '../lib/queue';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import { createJob, updateJobStatus } from '../lib/jobs';
import { apiSuccess, apiError, validatePlatform } from '../lib/utils';

/**
 * 处理数据处理请求
 * @param req 请求对象
 * @param res 响应对象
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(apiError('Method Not Allowed', 405));
  }

  try {
    const { platform, uploadId, year, month } = req.body;

    // 验证参数
    if (!platform) {
      return res.status(400).json(apiError('Platform is required', 400));
    }

    if (!uploadId) {
      return res.status(400).json(apiError('Upload ID is required', 400));
    }

    if (!year || isNaN(Number(year))) {
      return res.status(400).json(apiError('Valid year is required', 400));
    }

    if (!month || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      return res.status(400).json(apiError('Valid month (1-12) is required', 400));
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      validatedPlatform = validatePlatform(platform);
    } catch (err) {
      return res.status(400).json(apiError(err.message, 400));
    }

    // 获取上传文件的路径列表
    let filePaths: string[] = [];

    if (config().storage.driver === 'local') {
      // 本地存储模式
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);

      try {
        // 检查上传目录是否存在
        await fs.access(uploadDir);

        // 获取目录中的所有文件
        const files = await fs.readdir(uploadDir);
        filePaths = files.map(file => path.join(uploadDir, file));
      } catch (err) {
        return res.status(404).json(apiError(`Upload directory not found for ID: ${uploadId}`, 404));
      }
    } else {
      // 云存储模式
      try {
        // 列出指定前缀的所有对象
        const prefix = `raw/${validatedPlatform}/${uploadId}/`;
        const objects = await storage().list(prefix);

        if (objects.length === 0) {
          return res.status(404).json(apiError(`No files found for upload ID: ${uploadId}`, 404));
        }

        filePaths = objects;
      } catch (err) {
        console.error('Error listing objects:', err);
        return res.status(500).json(apiError('Failed to list uploaded files', 500));
      }
    }

    // 创建作业
    const job = await createJob({
      platform: validatedPlatform,
      uploadId,
      year: Number(year),
      month: Number(month),
      files: filePaths,
      metadata: {
        requestedBy: 'user', // 实际应用中应从认证中获取
        requestedAt: new Date().toISOString(),
      }
    });

    // 根据环境决定处理策略
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (config().storage.driver === 'local' && isDevelopment) {
      // 本地开发模式：同步执行处理
      // 注意：实际项目中，这里应该调用适配器进行处理
      // 此处为简化实现，仅更新作业状态
      await updateJobStatus(job.id, 'processing', '正在处理数据...');

      // 模拟处理延迟
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 更新作业状态为已完成
      await updateJobStatus(job.id, 'completed', '处理完成', 100, {
        factCount: 150, // 模拟值
        aggCount: 10, // 模拟值
      });

      // 返回处理结果
      return res.status(200).json(apiSuccess({
        jobId: job.id,
        status: 'completed',
        message: '处理完成',
        factCount: 150,
        aggCount: 10,
        warnings: [],
      }));
    } else {
      // 云环境：将任务添加到队列
      await queue().enqueue({
        jobId: job.id,
        platform: validatedPlatform,
        uploadId,
        year: Number(year),
        month: Number(month),
        fileObjects: filePaths, // 对象存储中的路径
      });

      // 返回作业ID
      return res.status(202).json(apiSuccess({
        jobId: job.id,
        status: 'pending',
        message: '已加入处理队列',
      }));
    }
  } catch (err) {
    console.error('Error processing data:', err);
    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}