/**
 * 清理测试数据脚本
 */
import fs from 'fs/promises';
import path from 'path';
import { resetMockStorage } from '../tests/vitest/utils/mockStorage';
import { resetStorage } from '../lib/storage';
import { resetConfig } from '../lib/config';

const TEST_PATHS = [
  // 测试存储数据
  path.join(process.cwd(), 'data', 'test-storage'),
  // 测试上传记录
  path.join(process.cwd(), 'data', 'uploads.json'),
  // 测试数据库
  path.join(process.cwd(), 'data', 'test.duckdb'),
  // 测试Parquet文件目录
  path.join(process.cwd(), 'data', 'parquet')
];

/**
 * 清理测试数据目录
 */
async function cleanupTestData() {
  console.log('开始清理测试数据...');

  // 重置内存中的状态
  resetMockStorage();
  resetStorage();
  resetConfig();

  // 清理文件系统
  for (const testPath of TEST_PATHS) {
    try {
      const stat = await fs.stat(testPath);

      if (stat.isDirectory()) {
        // 递归删除目录
        await fs.rm(testPath, { recursive: true, force: true });
        console.log(`已删除目录: ${testPath}`);

        // 重新创建空目录
        await fs.mkdir(testPath, { recursive: true });
        console.log(`已创建空目录: ${testPath}`);
      } else {
        // 删除文件
        await fs.unlink(testPath);
        console.log(`已删除文件: ${testPath}`);
      }
    } catch (err: any) {
      // 忽略不存在的文件/目录
      if (err.code !== 'ENOENT') {
        console.error(`清理 ${testPath} 时出错:`, err);
      }
    }
  }

  console.log('测试数据清理完成');
}

// 执行清理
cleanupTestData().catch((err: any) => {
  console.error('清理测试数据失败:', err);
  process.exit(1);
});