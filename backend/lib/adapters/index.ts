/**
 * 适配器注册表
 * 自动加载所有平台适配器
 */
import { registerAdapter, getAllAdapters } from './base';

// 导入平台适配器
import './example'; // 示例适配器（用于测试）
import './wechat_video'; // 微信视频号
import './xiaohongshu'; // 小红书
import './douyin'; // 抖音

/**
 * 初始化所有适配器
 * 应在应用启动时调用
 */
export function initAdapters(): void {
  // 获取所有已注册的适配器
  const adapters = getAllAdapters();

  // 输出已注册的适配器信息
  console.log(`已加载 ${adapters.length} 个平台适配器:`);
  adapters.forEach(adapter => {
    console.log(`- ${adapter.platformName} (${adapter.platformCode})`);
  });
}

// 自动初始化
initAdapters();