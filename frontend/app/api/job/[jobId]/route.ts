/**
 * 作业状态API - 查询作业处理状态
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuccessResponse, getErrorResponse, getRequestId } from '@/lib/server-utils';
import { getJobInfo } from '@/lib/jobs';
import { resolveUserId } from '@/lib/user';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    // 获取作业ID，Next.js 15+ 需要 await params
    const { jobId } = await params;
    // 获取请求ID，直接使用同步版本
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    if (!jobId) {
      return getErrorResponse('作业ID缺失', 400, undefined, undefined, requestId);
    }

    // 从请求中解析用户ID
    const userId = resolveUserId(req);

    // 获取作业信息
    const job = await getJobInfo(jobId);

    if (!job) {
      return getErrorResponse(`作业不存在: ${jobId}`, 404, undefined, undefined, requestId);
    }

    // 验证用户权限（确保只能查看自己的作业）
    if (job.userId && job.userId !== userId) {
      return getErrorResponse('无权访问此作业', 403, undefined, undefined, requestId);
    }

    // 构建响应
    const response = {
      jobId: job.id,
      status: job.status,
      message: job.message,
      progress: job.progress || 0,
      datasetId: job.datasetId,
      platform: job.platform,
      year: job.year,
      month: job.month,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };

    // 根据作业状态添加额外信息
    if (job.status === 'completed') {
      Object.assign(response, {
        completedAt: job.completedAt,
        factCount: job.metadata?.factCount,
        aggCount: job.metadata?.aggCount,
        warnings: job.metadata?.warnings || [],
      });
    } else if (job.status === 'failed') {
      Object.assign(response, {
        error: job.metadata?.error || job.message,
        warnings: job.metadata?.warnings || [],
      });
    }

    return getSuccessResponse(response, requestId);
  } catch (err) {
    console.error('获取作业状态错误:', err);
    return getErrorResponse('获取作业状态时发生错误', 500);
  }
}
