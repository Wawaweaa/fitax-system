/**
 * 处理API - 触发数据处理
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queue } from '@/lib/queue';
import { getUploadRecord } from '@/lib/uploads';
import { createJob } from '@/lib/jobs';
import { getSuccessResponse, getErrorResponse, validatePlatform, getRequestId } from '@/lib/server-utils';
import { resolveUserId } from '@/lib/user';
import { getEffectiveDataset } from '@/lib/datasets';

// 处理请求参数接口
interface ProcessRequest {
  platform: string;
  year: number;
  month: number;
  mode?: 'merge' | 'replace';
  uploads: {
    settlementUploadId?: string;
    ordersUploadId?: string;
  };
}

// 生成数据集ID
function generateDatasetId(userId: string, platform: string, year: number, month: number): string {
  const key = `${userId}:${platform}:${year}:${month}`;
  return `dataset-${crypto.createHash('sha256').update(key).digest('hex').substring(0, 8)}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 从请求中解析用户ID
    const userId = resolveUserId(req);
    // 获取请求ID，直接使用同步版本
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    // 解析请求JSON
    const body = await req.json() as ProcessRequest;
    // 调试：记录收到的完整请求体（便于确认 year/month 来源）
    try { console.log('[process] request body', body); } catch {}

    // 验证请求参数
    if (!body.platform) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '平台参数缺失',
        },
        {
          status: 400
        }
      );
    }

    // 验证年份
    if (!body.year || isNaN(body.year)) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '年份参数无效',
        },
        {
          status: 400
        }
      );
    }

    // 验证月份
    if (!body.month || isNaN(body.month) || body.month < 1 || body.month > 12) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '月份参数无效，应在1-12之间',
        },
        {
          status: 400
        }
      );
    }

    // 验证上传ID
    if (!body.uploads.settlementUploadId) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: '结算文件上传ID缺失',
        },
        {
          status: 400
        }
      );
    }

    // 对于小红书和抖音，要求订单文件
    if (
      (body.platform === 'xiaohongshu' || body.platform === 'douyin') &&
      !body.uploads.ordersUploadId
    ) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: `${body.platform}平台需要提供订单文件`,
        },
        {
          status: 400
        }
      );
    }

    // 验证平台
    let platform: string;
    try {
      // 验证平台名
      const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];
      const normalized = body.platform.toLowerCase().trim();

      if (!validPlatforms.includes(normalized)) {
        throw new Error(`不支持的平台: ${body.platform}。支持的平台: ${validPlatforms.join(', ')}`);
      }

      platform = normalized;
    } catch (err) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: err instanceof Error ? err.message : "验证平台失败",
        },
        {
          status: 400
        }
      );
    }

    // 处理模式
    const mode = body.mode || 'merge';

    // 验证上传记录（严格依赖 uploadId）
    const settlementUpload = await getUploadRecord(body.uploads.settlementUploadId);
    if (!settlementUpload) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: `结算文件上传记录不存在: ${body.uploads.settlementUploadId}`,
          code: 'UPLOAD_NOT_FOUND',
          details: {
            uploadId: body.uploads.settlementUploadId,
            fileType: 'settlement'
          }
        },
        { status: 404 }
      );
    }

    // 验证上传记录的完整性
    if (!settlementUpload.objectKey) {
      return NextResponse.json(
        {
          request_id: requestId,
          message: `上传记录缺少 objectKey: ${body.uploads.settlementUploadId}`,
          code: 'INVALID_UPLOAD_RECORD',
        },
        { status: 400 }
      );
    }

    let ordersUpload = null;
    if (body.uploads.ordersUploadId) {
      ordersUpload = await getUploadRecord(body.uploads.ordersUploadId);
      if (!ordersUpload) {
        return NextResponse.json(
          {
            request_id: requestId,
            message: `订单文件上传记录不存在: ${body.uploads.ordersUploadId}`,
            code: 'UPLOAD_NOT_FOUND',
            details: {
              uploadId: body.uploads.ordersUploadId,
              fileType: 'orders'
            }
          },
          { status: 404 }
        );
      }

      if (!ordersUpload.objectKey) {
        return NextResponse.json(
          {
            request_id: requestId,
            message: `订单上传记录缺少 objectKey: ${body.uploads.ordersUploadId}`,
            code: 'INVALID_UPLOAD_RECORD',
          },
          { status: 400 }
        );
      }
    }

    // 在创建作业前执行重复拦截（同租户 + 同平台 + 同年 + 同月）
    try {
      console.log('[process] check duplicate start', {
        userId,
        platform,
        year: body.year,
        month: body.month,
      });
      const existing = await getEffectiveDataset(userId, platform, body.year, body.month);
      console.log('[process] check duplicate result', {
        hasExisting: !!existing,
        dataset: existing && {
          id: existing.id,
          userId: existing.userId,
          platform: existing.platform,
          year: existing.year,
          month: existing.month,
          metadata: existing.metadata,
        },
      });
      if (existing) {
        console.log('[upload] duplicate upload blocked', {
          tenantId: userId,
          platform,
          year: body.year,
          month: body.month,
        });

        // 改为复用已有 dataset，而不是返回 400
        const meta = existing?.metadata || {} as any;
        const jobIds = Array.isArray(meta.jobIds) ? meta.jobIds.filter(Boolean) : [];
        const jobId = meta.jobId || (jobIds.length > 0 ? jobIds[jobIds.length - 1] : undefined);
        const factCount = typeof meta.factCount === 'number' ? meta.factCount : undefined;
        const aggCount = typeof meta.aggCount === 'number' ? meta.aggCount : undefined;

        try {
          console.log('[process] duplicate upload reuse existing dataset', {
            userId,
            platform,
            year: body.year,
            month: body.month,
            datasetId: existing.id,
            jobId,
            factCount,
            aggCount,
          });
        } catch {}

        return NextResponse.json(
          {
            request_id: requestId,
            data: {
              status: 'duplicate_reused',
              datasetId: existing.id,
              jobId,
              factCount,
              aggCount,
              message: '检测到相同数据，本次复用历史结果'
            }
          },
          { status: 200 }
        );
      }
    } catch (err) {
      // 即便查询失败，也不要继续创建作业，避免产生脏数据
      console.error('[process] duplicate check failed:', err);
      return NextResponse.json(
        {
          request_id: requestId,
          message: '检测重复上传时发生错误',
        },
        { status: 500 }
      );
    }

    // 生成作业ID和数据集ID
    const jobId = `job-${uuidv4()}`;
    const datasetId = generateDatasetId(userId, platform, body.year, body.month);

    // 准备文件对象键与元数据（从上传记录中提取）
    const fileObjects: Record<string, string> = {
      settlement: settlementUpload.objectKey
    };

    // 准备文件元数据（供 Worker 使用）
    const fileMetadata: Record<string, {
      id: string;
      objectKey: string;
      contentHash: string;
      fileType: string;
      originalFilename: string;
      size: number;
    }> = {
      settlement: {
        id: settlementUpload.id,
        objectKey: settlementUpload.objectKey,
        contentHash: settlementUpload.contentHash,
        fileType: settlementUpload.fileType,
        originalFilename: settlementUpload.originalFilename,
        size: settlementUpload.size
      }
    };

    if (ordersUpload) {
      fileObjects.orders = ordersUpload.objectKey;
      fileMetadata.orders = {
        id: ordersUpload.id,
        objectKey: ordersUpload.objectKey,
        contentHash: ordersUpload.contentHash,
        fileType: ordersUpload.fileType,
        originalFilename: ordersUpload.originalFilename,
        size: ordersUpload.size
      };
    }

    // 创建作业记录（在入队前创建，确保 worker 能找到作业）
    console.log('[process] 创建作业，jobId:', jobId, 'userId:', userId, 'platform:', platform);
    console.log('[process] 文件元数据:', JSON.stringify(fileMetadata, null, 2));
    try {
      await createJob({
        id: jobId,
        userId,
        platform,
        year: body.year,
        month: body.month,
        uploadId: body.uploads.settlementUploadId,
        datasetId,
        fileObjects
      });
      console.log('[process] 作业创建成功:', jobId);
    } catch (err) {
      console.error('[process] 作业创建失败:', err);
      throw err;
    }

    // 入队处理（payload 包含完整文件元数据）
    console.log('[process] enqueue job', { jobId, userId, platform, year: body.year, month: body.month });
    await queue().enqueue({
      jobId,
      userId,
      platform,
      year: body.year,
      month: body.month,
      mode,
      datasetId,
      fileObjects,          // 保留：兼容性字段
      fileMetadata,         // 新增：完整元数据（objectKey/contentHash/fileType等）
      uploads: {            // 保留：uploadId 引用
        settlementUploadId: body.uploads.settlementUploadId,
        ordersUploadId: body.uploads.ordersUploadId
      },
      requestId
    });

    // 严格通过队列处理，不做任何同步调用 processData 的兜底。
    // 如未来发现其他路径直接调用处理函数，请在调用点打印：
    // console.warn('[worker-bypass-warning] processData called directly', { jobId })

    // 返回结果
    return NextResponse.json(
      {
        request_id: requestId,
        data: {
          jobId,
          status: 'queued',
          message: '已加入处理队列'
        }
      },
      {
        status: 200
      }
    );
  } catch (err) {
    console.error('处理请求错误:', err);
    return NextResponse.json(
      {
        request_id: requestId,
        message: '处理请求时发生错误'
      },
      {
        status: 500
      }
    );
  }
}
