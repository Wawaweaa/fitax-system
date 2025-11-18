// frontend/lib/utils.ts —— 仅供前端组件使用
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number) {
  if (n == null || Number.isNaN(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatInt(n: number) {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}
