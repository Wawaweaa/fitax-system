/**
 * E2E测试环境设置
 */
import { MockStorage, getMockStorage } from './mockStorage';
import { resetConfig } from '../../../lib/config';
import { vi } from 'vitest';

// Mock存储模块
let mockActive = false;

/**
 * 设置E2E测试环境
 */
export function setupE2EEnvironment(): void {
  // 使用vitest的mock功能
  vi.mock('../../../lib/storage', () => ({
    storage: () => getMockStorage()
  }));

  mockActive = true;
}

/**
 * 清理E2E测试环境
 */
export function teardownE2EEnvironment(): void {
  // 清除mock
  if (mockActive) {
    vi.unmock('../../../lib/storage');
    mockActive = false;
  }

  // 重置配置
  resetConfig();
}