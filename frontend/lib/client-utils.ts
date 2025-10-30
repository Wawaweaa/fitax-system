/**
 * 客户端工具函数
 * 该文件中的函数仅供客户端使用，不应在服务器组件中导入
 */
import { v4 as uuidv4 } from 'uuid';

// 生成唯一ID（可选前缀）
export function generateId(prefix: string = ''): string {
  return `${prefix}${uuidv4()}`;
}

// 获取或生成请求ID
export function getRequestId(headers?: Headers): string {
  const requestId = headers?.get('x-request-id');
  if (requestId) {
    return requestId;
  }
  return `req-${uuidv4()}`;
}

// 验证平台名
export function validatePlatform(platform: string): string {
  const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];
  const normalized = platform.toLowerCase().trim();

  if (!validPlatforms.includes(normalized)) {
    throw new Error(`不支持的平台: ${platform}。支持的平台: ${validPlatforms.join(', ')}`);
  }

  return normalized;
}

// API 成功/失败响应辅助
export function apiSuccess<T>(data: T) {
  return {
    data,
    request_id: `req-${uuidv4()}`
  };
}

export function apiError(message: string, code: number = 500) {
  return {
    message,
    code,
    request_id: `req-${uuidv4()}`
  };
}

// 格式化货币
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// 格式化日期
export function formatDate(date: Date | string | number): string {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// 获取月份名称
export function getMonthName(month: number): string {
  const monthNames = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月'
  ];
  return monthNames[month - 1] || '';
}

// 获取当前年份
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

// 获取当前月份
export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}