/**
 * 预签名上传URL API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import { apiSuccess, apiError, validatePlatform } from '../lib/utils';

/**
 * 处理预签名上传URL请求
 * @param req 请求对象
 * @param res 响应对象
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method Not Allowed', 405));
  }

  try {
    // 获取查询参数
    const { platform, uploadId, fileKey, contentType } = req.query;

    // 验证参数
    if (!platform) {
      return res.status(400).json(apiError('Platform is required', 400));
    }

    if (!uploadId) {
      return res.status(400).json(apiError('Upload ID is required', 400));
    }

    if (!fileKey) {
      return res.status(400).json(apiError('File key is required', 400));
    }

    // 验证平台
    let validatedPlatform: string;
    try {
      validatedPlatform = validatePlatform(platform as string);
    } catch (err) {
      return res.status(400).json(apiError(err.message, 400));
    }

    // 检查存储驱动类型
    const storageDriver = config().storage.driver;
    if (storageDriver === 'local') {
      return res.status(400).json(apiError('Local storage does not support signed URLs', 400));
    }

    // 构建对象键
    const objectKey = `raw/${validatedPlatform}/${uploadId}/${fileKey}`;

    // 获取签名上传 URL
    const uploadUrl = await storage().getPresignedUploadUrl(objectKey, {
      contentType: contentType as string,
      expiresIn: config().signedUrlExpiry,
    });

    // 如果无法获取签名URL
    if (!uploadUrl) {
      return res.status(500).json(apiError('Failed to generate signed URL', 500));
    }

    // 返回签名上传 URL
    return res.status(200).json(apiSuccess({
      uploadUrl,
      objectKey,
      expiresIn: config().signedUrlExpiry,
    }));
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}