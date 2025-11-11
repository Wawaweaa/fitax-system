/**
 * 工具函数
 */
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';

/**
 * 生成唯一ID
 * @param prefix ID 前缀
 * @returns 唯一ID
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now().toString(36)}_${nanoid(8)}`;
}

/**
 * 确保目录存在
 * @param dirPath 目录路径
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // 忽略目录已存在错误
  }
}

/**
 * 创建本地上传目录
 * @param uploadId 上传ID
 * @returns 上传目录路径
 */
export async function createUploadDir(uploadId: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
  await ensureDir(uploadDir);
  return uploadDir;
}

/**
 * 保存表单文件到本地
 * @param file 表单文件对象
 * @param uploadDir 上传目录
 * @returns 保存的文件路径
 */
export async function saveFormFile(file: any, uploadDir: string): Promise<string> {
  const filePath = path.join(uploadDir, file.originalFilename || file.name);

  // 读取临时文件并保存到目标路径
  const fileData = await fs.readFile(file.filepath);
  await fs.writeFile(filePath, fileData);

  return filePath;
}

/**
 * 返回 API 成功响应
 * @param data 响应数据
 * @param status HTTP 状态码
 * @returns API 响应对象
 */
export function apiSuccess<T>(data: T, status: number = 200) {
  return {
    status,
    body: { success: true, data },
  };
}

/**
 * 返回 API 错误响应
 * @param message 错误消息
 * @param status HTTP 状态码
 * @param errors 详细错误信息
 * @returns API 错误响应对象
 */
export function apiError(message: string, status: number = 400, errors?: any) {
  return {
    status,
    body: {
      success: false,
      error: { message, ...(errors ? { details: errors } : {}) }
    },
  };
}

/**
 * 检查并获取环境变量值
 * @param key 环境变量名
 * @param fallback 默认值
 * @returns 环境变量值或默认值
 */
export function env(key: string, fallback?: string): string {
  const value = process.env[key];

  if (value === undefined && fallback === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }

  return value !== undefined ? value : fallback!;
}

/**
 * 转义 SQL 注入风险字符
 * @param input 输入字符串
 * @returns 转义后的字符串
 */
export function escapeSql(input: string): string {
  return input.replace(/'/g, "''");
}

/**
 * 解析并验证平台参数
 * @param platform 平台名称
 * @returns 验证后的平台名称
 */
export function validatePlatform(platform?: string): string {
  const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];

  if (!platform || !validPlatforms.includes(platform)) {
    throw new Error(`Invalid platform: ${platform}. Must be one of: ${validPlatforms.join(', ')}`);
  }

  return platform;
}

/**
 * 计算大小和单位
 * @param bytes 字节数
 * @returns 格式化的大小
 */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 计算文件的 MD5 哈希
 * @param filePath 文件路径
 * @returns MD5 哈希值
 */
export async function calculateFileMd5(filePath: string): Promise<string> {
  const crypto = require('crypto');
  const fileData = await fs.readFile(filePath);
  return crypto.createHash('md5').update(fileData).digest('hex');
}