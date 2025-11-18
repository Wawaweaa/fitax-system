/**
 * 上传管理
 * 负责记录上传历史和检测重复文件
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { ensureDir } from './server-utils';
import { storage } from './storage';

// 数据目录
const DATA_DIR = path.join(process.cwd(), 'data');
// 上传记录文件
const UPLOADS_FILE = path.join(DATA_DIR, 'uploads.json');

// 上传记录类型
export interface UploadRecord {
  id: string;
  userId: string;
  platform: string;
  fileType: string;
  contentHash: string;
  originalFilename: string;
  fileName: string; // 添加fileName字段，与测试/API一致
  objectKey?: string;
  size: number;
  uploadedAt: Date;
  isDuplicate: boolean;
  datasetId?: string;
}

// 内存缓存
let uploadsCache: UploadRecord[] | null = null;

/**
 * 初始化上传记录文件
 */
async function initUploadsFile(): Promise<void> {
  await ensureDir(DATA_DIR);

  try {
    await fs.access(UPLOADS_FILE);
  } catch (err) {
    // 文件不存在，创建空记录
    await fs.writeFile(UPLOADS_FILE, JSON.stringify([]));
  }
}

/**
 * 获取所有上传记录
 * @returns 上传记录数组
 */
async function getUploads(): Promise<UploadRecord[]> {
  if (uploadsCache !== null) {
    return uploadsCache;
  }

  await initUploadsFile();

  try {
    const data = await fs.readFile(UPLOADS_FILE, 'utf-8');
    const parsedData = JSON.parse(data);

    // 处理旧记录，添加缺失的fileName字段
    parsedData.forEach((record: any) => {
      if (!record.fileName && record.originalFilename) {
        record.fileName = record.originalFilename;
      }
    });

    uploadsCache = parsedData;
    return uploadsCache;
  } catch (err) {
    console.error('读取上传记录失败:', err);
    return [];
  }
}

/**
 * 保存上传记录
 * @param uploads 上传记录数组
 */
async function saveUploads(uploads: UploadRecord[]): Promise<void> {
  await initUploadsFile();

  try {
    // 由于Date类型会被序列化为字符串，这里先转换为JSON格式
    const data = JSON.stringify(uploads);
    await fs.writeFile(UPLOADS_FILE, data);
    uploadsCache = uploads;
  } catch (err) {
    console.error('保存上传记录失败:', err);
    throw err;
  }
}

/**
 * 检查是否为重复文件
 * @param userId 用户ID
 * @param platform 平台
 * @param fileType 文件类型
 * @param contentHash 内容哈希
 * @returns 是否重复
 */
export async function checkDuplicateFile(
  userId: string,
  platform: string,
  fileType: string,
  contentHash: string
): Promise<boolean> {
  const uploads = await getUploads();

  // 检查是否有相同内容哈希的上传记录
  return uploads.some(upload =>
    upload.userId === userId &&
    upload.platform === platform &&
    upload.fileType === fileType &&
    upload.contentHash === contentHash
  );
}

/**
 * 获取重复文件的上传ID
 * @param userId 用户ID
 * @param platform 平台
 * @param fileType 文件类型
 * @param contentHash 内容哈希
 * @returns 上传ID
 */
export async function getDuplicateUploadId(
  userId: string,
  platform: string,
  fileType: string,
  contentHash: string
): Promise<string | null> {
  const uploads = await getUploads();

  // 查找重复文件记录
  const duplicate = uploads.find(upload =>
    upload.userId === userId &&
    upload.platform === platform &&
    upload.fileType === fileType &&
    upload.contentHash === contentHash
  );

  return duplicate ? duplicate.id : null;
}

/**
 * 注册上传记录
 * @param upload 上传记录
 * @returns 上传ID
 */
export async function registerUpload(upload: Partial<UploadRecord>): Promise<string> {
  const uploads = await getUploads();

  // 如果是重复文件，查找并返回已有的上传ID
  if (upload.isDuplicate && upload.userId && upload.platform && upload.fileType && upload.contentHash) {
    const existingUpload = uploads.find(u =>
      u.userId === upload.userId &&
      u.platform === upload.platform &&
      u.fileType === upload.fileType &&
      u.contentHash === upload.contentHash
    );

    if (existingUpload) {
      return existingUpload.id;
    }
  }

  // 生成新的上传记录
  const uploadId = upload.id || `ULP-${uuidv4()}`;
  const newUpload: UploadRecord = {
    id: uploadId,
    userId: upload.userId || 'unknown',
    platform: upload.platform || '',
    fileType: upload.fileType || '',
    contentHash: upload.contentHash || '',
    originalFilename: upload.originalFilename || '',
    fileName: upload.originalFilename || '', // 添加fileName字段，值与originalFilename保持一致
    objectKey: upload.objectKey,
    size: upload.size || 0,
    uploadedAt: upload.uploadedAt || new Date(),
    isDuplicate: upload.isDuplicate || false,
    datasetId: upload.datasetId
  };

  // 添加到记录并保存
  uploads.push(newUpload);
  await saveUploads(uploads);

  return uploadId;
}

/**
 * 获取上传记录
 * @param uploadId 上传ID
 * @returns 上传记录
 */
export async function getUploadRecord(uploadId: string): Promise<UploadRecord | null> {
  const uploads = await getUploads();
  return uploads.find(upload => upload.id === uploadId) || null;
}

/**
 * 更新上传记录
 * @param uploadId 上传ID
 * @param updates 要更新的字段
 * @returns 更新后的记录
 */
export async function updateUploadRecord(
  uploadId: string,
  updates: Partial<UploadRecord>
): Promise<UploadRecord | null> {
  const uploads = await getUploads();
  const index = uploads.findIndex(upload => upload.id === uploadId);

  if (index === -1) {
    return null;
  }

  // 更新记录
  const updatedUpload = { ...uploads[index], ...updates };
  uploads[index] = updatedUpload;

  await saveUploads(uploads);
  return updatedUpload;
}

/**
 * 获取用户的所有上传记录
 * @param userId 用户ID
 * @param limit 限制数量
 * @param offset 偏移量
 * @returns 上传记录数组
 */
export async function getUserUploads(
  userId: string,
  limit?: number,
  offset?: number
): Promise<UploadRecord[]> {
  const uploads = await getUploads();

  // 过滤出用户的上传记录
  const userUploads = uploads.filter(upload => upload.userId === userId);

  // 按上传时间排序（最新的在前）
  userUploads.sort((a, b) => {
    const dateA = new Date(a.uploadedAt);
    const dateB = new Date(b.uploadedAt);
    return dateB.getTime() - dateA.getTime();
  });

  // 应用分页
  if (offset !== undefined && limit !== undefined) {
    return userUploads.slice(offset, offset + limit);
  } else if (limit !== undefined) {
    return userUploads.slice(0, limit);
  } else {
    return userUploads;
  }
}

/**
 * 上传文件
 * @param fileName 文件名
 * @param fileContent 文件内容
 * @param userId 用户ID
 * @returns 上传结果
 */
export async function uploadFile(
  fileName: string,
  fileContent: Buffer,
  userId: string
): Promise<{ uploadId: string, contentHash: string }> {
  // 计算内容哈希
  const crypto = require('crypto');
  const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');

  // 提取文件类型
  const ext = path.extname(fileName).toLowerCase();
  const fileType = ext === '.csv' ? 'settlement' : ext.replace(/^./, '');

  // 检查是否为重复文件
  const platform = path.extname(fileName).toLowerCase() === '.csv' ? 'wechat_video' : '';
  const isDuplicate = await checkDuplicateFile(userId, platform, fileType, contentHash);

  // 如果是重复文件，直接返回已有上传ID
  if (isDuplicate) {
    const duplicateId = await getDuplicateUploadId(userId, platform, fileType, contentHash);
    if (duplicateId) {
      return {
        uploadId: duplicateId,
        contentHash
      };
    }
  }

  // 存储文件内容
  const storageInstance = storage();
  const objectKey = `uploads/${userId}/${contentHash}/${fileName}`;
  await storageInstance.putObject(objectKey, fileContent);

  // 注册上传记录
  const uploadId = await registerUpload({
    userId,
    platform,
    fileType,
    contentHash,
    originalFilename: fileName,
    objectKey,
    size: fileContent.length,
    uploadedAt: new Date(),
    isDuplicate
  });

  return {
    uploadId,
    contentHash
  };
}

/**
 * 生成数据集ID
 * @param userId 用户ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @returns 数据集ID
 */
export function generateDatasetId(
  userId: string,
  platform: string,
  year: number,
  month: number
): string {
  const key = `${userId}:${platform}:${year}:${month}`;
  const crypto = require('crypto');
  return `dataset-${crypto.createHash('sha256').update(key).digest('hex').substring(0, 8)}`;
}
