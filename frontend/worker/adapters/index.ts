/**
 * 平台适配器工厂 - 根据平台类型获取相应的适配器
 */
import { Platform } from '../../lib/types';
import { PlatformAdapter } from './base';
import { XiaohongshuAdapter } from './xiaohongshu';
import { DouyinAdapter } from './douyin';
import { WechatVideoAdapter } from './wechat_video';

// 适配器实例缓存
const adapters = new Map<Platform, PlatformAdapter>();

/**
 * 获取平台适配器
 * @param platform 平台类型
 * @returns 平台适配器实例
 */
export function getAdapter(platform: Platform): PlatformAdapter {
  // 检查缓存
  if (adapters.has(platform)) {
    return adapters.get(platform)!;
  }

  // 创建新适配器实例
  let adapter: PlatformAdapter;

  switch (platform) {
    case 'xiaohongshu':
      adapter = new XiaohongshuAdapter();
      break;
    case 'douyin':
      adapter = new DouyinAdapter();
      break;
    case 'wechat_video':
      adapter = new WechatVideoAdapter();
      break;
    default:
      throw new Error(`不支持的平台类型: ${platform}`);
  }

  // 缓存适配器实例
  adapters.set(platform, adapter);

  return adapter;
}

// 导出适配器类
export * from './base';
export * from './xiaohongshu';
export * from './douyin';
export * from './wechat_video';