/**
 * 适配器测试脚本
 *
 * 该脚本用于测试平台适配器的文件解析功能
 */
import path from 'path';
import fs from 'fs/promises';
import { PlatformAdapter } from '../worker/adapters/base';
import { XiaohongshuAdapter } from '../worker/adapters/xiaohongshu';
import { DouyinAdapter } from '../worker/adapters/douyin';
import { WechatVideoAdapter } from '../worker/adapters/wechat_video';
import { Platform } from '../lib/types';

// 测试文件路径
const TEST_FILES = {
  xiaohongshu: path.join(__dirname, '../tests/samples/xiaohongshu_sample.csv'),
  douyin: path.join(__dirname, '../tests/samples/douyin_sample.csv'),
  wechat_video: path.join(__dirname, '../tests/samples/wechat_video_sample.csv')
};

// 测试用户ID
const TEST_USER_ID = 'test-user-001';

// 测试年月
const TEST_YEAR = 2024;
const TEST_MONTH = 10;

/**
 * 测试适配器
 */
async function testAdapter(platform: Platform): Promise<void> {
  console.log(`测试${platform}适配器...`);

  // 获取适配器
  let adapter: PlatformAdapter;

  switch(platform) {
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
      throw new Error(`不支持的平台: ${platform}`);
  }

  // 测试文件路径
  const testFile = TEST_FILES[platform];

  try {
    // 确保测试文件存在
    await fs.access(testFile);

    // 解析文件
    const result = await adapter.parseFiles(
      testFile,
      null,
      {
        platform,
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    // 打印结果
    console.log(`解析成功: ${result.factRows.length}行数据`);

    if (result.warnings.length > 0) {
      console.log('警告:');
      result.warnings.forEach((warning, i) => {
        console.log(`  ${i+1}. ${warning}`);
      });
    }

    // 打印前3行数据
    if (result.factRows.length > 0) {
      console.log('数据示例:');
      result.factRows.slice(0, 3).forEach((row, i) => {
        console.log(`行 ${i+1}:`);
        console.log(`  订单号: ${row.order_id}`);
        console.log(`  SKU: ${row.internal_sku}`);
        console.log(`  数量: ${row.qty_sold}`);
        console.log(`  应收: ${row.recv_customer + row.recv_platform + row.extra_charge}`);
        console.log(`  费用: ${row.fee_platform_comm + row.fee_affiliate + row.fee_other}`);
        console.log(`  应到账: ${row.net_received}`);
      });
    }
  } catch (err) {
    console.error(`测试失败:`, err);
  }
}

/**
 * 确保测试样例目录存在
 */
async function ensureTestDirectory(): Promise<void> {
  const testDir = path.join(__dirname, '../tests/samples');
  try {
    await fs.mkdir(testDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  // 检查测试文件是否存在
  for (const platform of Object.keys(TEST_FILES) as Platform[]) {
    const filePath = TEST_FILES[platform];
    try {
      await fs.access(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`测试文件不存在: ${filePath}`);
        console.error(`请确保样例文件已放置在正确的位置`);
        process.exit(1);
      }
    }
  }
}

/**
 * 运行测试
 */
async function runTests(): Promise<void> {
  try {
    // 确保测试目录存在
    await ensureTestDirectory();

    // 测试小红书适配器
    await testAdapter('xiaohongshu');
    console.log('\n');

    // 测试抖音适配器
    await testAdapter('douyin');
    console.log('\n');

    // 测试微信视频号适配器
    await testAdapter('wechat_video');
  } catch (err) {
    console.error('测试失败:', err);
  }
}

// 运行测试
runTests();