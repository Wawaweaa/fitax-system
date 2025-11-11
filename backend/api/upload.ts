/**
 * 文件上传 API 端点
 */
import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import { apiSuccess, apiError, generateId, validatePlatform, createUploadDir, saveFormFile } from '../lib/utils';

// 禁用默认 body 解析，因为我们使用 formidable 处理表单数据
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * 处理文件上传
 * @param req 请求对象
 * @param res 响应对象
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(apiError('Method Not Allowed', 405));
  }

  try {
    // 使用 formidable 解析表单数据
    const form = formidable({
      keepExtensions: true,
      maxFileSize: config().uploadMaxSize * 1024 * 1024, // 配置的最大文件大小
    });

    // 解析表单数据
    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // 验证平台
    let platform: string;
    try {
      platform = validatePlatform(fields.platform as string);
    } catch (err) {
      return res.status(400).json(apiError(err.message, 400));
    }

    // 生成上传 ID
    const uploadId = generateId('upload_');

    // 检查是否有文件
    const filesList = Object.values(files);
    if (filesList.length === 0) {
      return res.status(400).json(apiError('No files uploaded', 400));
    }

    // 检查文件类型
    const allowedTypes = config().allowedFileTypes;
    for (const file of filesList) {
      const fileType = file.originalFilename?.split('.').pop()?.toLowerCase() || '';
      if (!allowedTypes.includes(`.${fileType}`)) {
        return res.status(415).json(apiError(`File type .${fileType} not allowed. Allowed types: ${allowedTypes.join(', ')}`, 415));
      }
    }

    // 使用不同的处理策略，取决于配置的存储驱动
    const storageDriver = config().storage.driver;

    // 结果文件数组
    const resultFiles: any[] = [];

    if (storageDriver === 'local') {
      // 本地存储模式（dev-local）
      const uploadDir = await createUploadDir(uploadId);

      // 保存上传的文件
      for (const file of filesList) {
        const fileKey = Object.keys(files).find(key => files[key] === file);
        if (!fileKey) continue;

        const filePath = await saveFormFile(file, uploadDir);
        resultFiles.push({
          key: fileKey,
          name: file.originalFilename || file.name,
          path: filePath,
          size: file.size,
        });
      }
    } else {
      // 云存储模式，直接返回上传ID，前端需要调用 /api/upload-signed 获取签名 URL
      for (const file of filesList) {
        const fileKey = Object.keys(files).find(key => files[key] === file);
        if (!fileKey) continue;

        resultFiles.push({
          key: fileKey,
          name: file.originalFilename || file.name,
          size: file.size,
        });
      }
    }

    // 返回上传结果
    return res.status(200).json(apiSuccess({
      uploadId,
      platform,
      files: resultFiles,
      mode: storageDriver === 'local' ? 'local' : 'cloud',
    }));
  } catch (err) {
    console.error('Error uploading files:', err);

    // 根据错误类型返回不同的状态码
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(apiError('File size exceeds limit', 413));
    }

    return res.status(500).json(apiError('Internal Server Error', 500));
  }
}