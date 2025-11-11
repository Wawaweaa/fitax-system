'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

function toJSONSafe(value: any): any {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => toJSONSafe(item));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = toJSONSafe(val);
    }
    return result;
  }
  return value;
}

// 确保目录存在
export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

// 写文件（自动建目录）
export async function writeFileSafe(filePath: string, data: string | Buffer) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, data);
}

// 读文件
export async function readFileSafe(filePath: string) {
  return fs.readFile(filePath);
}

// 生成唯一ID（可选前缀）
export async function generateId(prefix: string = ''): Promise<string> {
  return `${prefix}${uuidv4()}`;
}

// 获取或生成请求ID
export async function getRequestId(headers?: Headers): Promise<string> {
  const requestId = headers?.get('x-request-id');
  if (requestId) {
    return requestId;
  }
  return `req-${uuidv4()}`;
}

// API 成功响应
export async function getSuccessResponse(data: any, requestId?: string): Promise<NextResponse> {
  const safeData = toJSONSafe(data);
  return NextResponse.json(
    {
      request_id: requestId || `req-${uuidv4()}`,
      data: safeData
    },
    {
      status: 200
    }
  );
}

// API 错误响应
export async function getErrorResponse(
  message: string,
  status: number = 500,
  code?: string,
  details?: any,
  requestId?: string
): Promise<NextResponse> {
  return NextResponse.json(
    {
      request_id: requestId || `req-${uuidv4()}`,
      message,
      code,
      details
    },
    {
      status
    }
  );
}

// 验证平台名
export async function validatePlatform(platform: string): Promise<string> {
  const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];
  const normalized = platform.toLowerCase().trim();

  if (!validPlatforms.includes(normalized)) {
    throw new Error(`不支持的平台: ${platform}。支持的平台: ${validPlatforms.join(', ')}`);
  }

  return normalized;
}

// API 成功/失败响应辅助
export async function apiSuccess<T>(data: T) {
  return {
    data,
    request_id: `req-${uuidv4()}`
  };
}

export async function apiError(message: string, code: number = 500) {
  return {
    message,
    code,
    request_id: `req-${uuidv4()}`
  };
}

// 提供node:path的path模块
export async function getPath(): Promise<typeof path> {
  return path;
}

// 提供node:crypto的crypto模块
export async function getCrypto(): Promise<typeof crypto> {
  return crypto;
}
