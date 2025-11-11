/**
 * 上传 API
 * - 校验 multipart/form-data
 * - 保存文件到本地 storage（开发模式）或接收元数据登记（生产模式）
 * - 在 uploads.json 记录索引（含 objectKey、contentHash 等）
 * - 支持重复检测：同 userId + platform + fileType + contentHash 只保留一份
 * - 响应结构：顶层 files 和 data.files 都返回，字段统一
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { resolveUserId } from '@/lib/user';
import { ensureDir } from '@/lib/server-utils';
import { registerUpload, getDuplicateUploadId } from '@/lib/uploads';

const SUPPORTED_PLATFORMS = ['xiaohongshu', 'douyin', 'wechat_video'] as const;
const REQUIRED_FILES: Record<(typeof SUPPORTED_PLATFORMS)[number], Array<'settlement' | 'orders'>> = {
  xiaohongshu: ['settlement', 'orders'],
  douyin: ['settlement', 'orders'],
  wechat_video: ['settlement'],
};

const DATA_DIR = path.join(process.cwd(), 'data');
const STORAGE_DIR = process.env.STORAGE_LOCAL_DIR || path.join(DATA_DIR, 'storage');

// 判断是否为生产模式（通过环境变量）
const IS_PRODUCTION_UPLOAD = process.env.UPLOAD_MODE === 'production';

function toError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

async function fileBuffer(file: File): Promise<Buffer> {
  const arr = await file.arrayBuffer();
  return Buffer.from(arr);
}

function hashBuffer(buf: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buf);
  return hash.digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const userId = resolveUserId(req);

    // TODO: 生产模式分支 - 接收 STS 直传后的元数据登记
    // 当 UPLOAD_MODE=production 时，前端直传到 OSS 后调用此接口登记元数据
    // 请求体格式: { platform, fileType, objectKey, contentHash, originalFilename, size }
    if (IS_PRODUCTION_UPLOAD) {
      // 预留：生产模式下接收元数据并登记
      // const body = await req.json();
      // const { platform, fileType, objectKey, contentHash, originalFilename, size } = body;
      // 调用 registerUpload() 直接登记，不落盘
      return toError('生产模式上传登记尚未实现，请设置 UPLOAD_MODE=development', 501);
    }

    // === 开发模式：本地 multipart 上传 ===
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return toError('请求必须为 multipart/form-data', 400);
    }

    const formData = await req.formData();
    const platformInput = formData.get('platform');

    if (!platformInput || typeof platformInput !== 'string') {
      return toError('缺少平台参数 platform', 400);
    }

    const platform = platformInput.toLowerCase().trim();
    if (!SUPPORTED_PLATFORMS.includes(platform as any)) {
      return toError(`不支持的平台。仅支持 ${SUPPORTED_PLATFORMS.join(', ')}`, 400);
    }

    const required = REQUIRED_FILES[platform as keyof typeof REQUIRED_FILES];
    const uploadFiles: Array<{ type: 'settlement' | 'orders'; file: File }> = [];

    for (const type of required) {
      const f = formData.get(type);
      if (!f || !(f instanceof File)) {
        return toError(`${platform} 需要上传 ${type} 文件`, 400);
      }
      uploadFiles.push({ type, file: f });
    }

    // 允许用户多传 orders，在 wechat_video 中忽略
    if (platform === 'wechat_video') {
      const extraOrders = formData.get('orders');
      if (extraOrders instanceof File) {
        uploadFiles.push({ type: 'orders', file: extraOrders });
      }
    }

    const results: Array<{
      uploadId: string;
      contentHash: string;
      isDuplicateFile: boolean;
      fileType: 'settlement' | 'orders';
      originalFilename: string;
      objectKey: string;
    }> = [];

    for (const { type, file } of uploadFiles) {
      const originalFilename = file.name || `${type}-${Date.now()}`;
      const buffer = await fileBuffer(file);
      const contentHash = hashBuffer(buffer);

      // 检查是否为重复文件
      const duplicateUploadId = await getDuplicateUploadId(userId, platform, type, contentHash);
      const isDuplicate = !!duplicateUploadId;

      let uploadId: string;
      let objectKey: string;

      if (isDuplicate) {
        // 重复文件，复用现有上传ID
        uploadId = duplicateUploadId;
        // 读取现有记录获取 objectKey
        const { getUploadRecord } = await import('@/lib/uploads');
        const existingRecord = await getUploadRecord(uploadId);
        objectKey = existingRecord?.objectKey || '';

        console.log(`[upload] 检测到重复文件: ${originalFilename}, 复用 uploadId: ${uploadId}`);
      } else {
        // 新文件，生成存储路径并落盘
        const storedPath = path.join(
          'raw',
          `user_id=${userId}`,
          `platform=${platform}`,
          `file_type=${type}`,
          `uploaded_at=${new Date().toISOString()}`,
          originalFilename,
        );
        const absPath = path.join(STORAGE_DIR, storedPath);

        // 写入文件
        await ensureDir(path.dirname(absPath));
        await fs.writeFile(absPath, buffer);

        objectKey = storedPath;

        // 调用 registerUpload() 登记上传记录
        uploadId = await registerUpload({
          userId,
          platform,
          fileType: type,
          contentHash,
          originalFilename,
          objectKey,
          size: buffer.length,
          uploadedAt: new Date(),
          isDuplicate: false,
        });

        console.log(`[upload] 新文件已保存: ${originalFilename}, uploadId: ${uploadId}`);
      }

      results.push({
        uploadId,
        contentHash,
        isDuplicateFile: isDuplicate,
        fileType: type,
        originalFilename,
        objectKey,
      });
    }

    // 返回统一格式
    return NextResponse.json(
      {
        files: results,
        data: { files: results },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[upload] error', error);
    return toError('处理上传时发生错误', 500);
  }
}

export const runtime = 'nodejs';
