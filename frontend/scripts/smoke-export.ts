#!/usr/bin/env ts-node
/**
 * 冒烟测试脚本 - 验证导出功能
 * 测试 /api/export 端点，确保导出为 CSV 和 XLSX 格式成功
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// 默认参数
interface ExportParams {
  platform: string;
  year: number;
  month: number;
  baseUrl: string;
}

// 解析命令行参数
function parseArgs(): ExportParams {
  const args = process.argv.slice(2);
  let platform = 'wechat_video';
  let year = 2024;
  let month = 8;
  let baseUrl = 'http://localhost:3002';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && i + 1 < args.length) {
      platform = args[i + 1];
      i++;
    } else if (args[i] === '--year' && i + 1 < args.length) {
      year = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--month' && i + 1 < args.length) {
      month = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--base-url' && i + 1 < args.length) {
      baseUrl = args[i + 1];
      i++;
    }
  }

  return { platform, year, month, baseUrl };
}

async function ensureTmpDir(): Promise<string> {
  const tmpDir = path.join(process.cwd(), '.tmp');
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    return tmpDir;
  } catch {
    return tmpDir;
  }
}

async function testExport(params: ExportParams): Promise<boolean> {
  const { platform, year, month, baseUrl } = params;

  console.log('📥 冒烟测试：导出功能');
  console.log('═'.repeat(60));
  console.log(`参数: platform=${platform}, year=${year}, month=${month}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log('');

  try {
    const tmpDir = await ensureTmpDir();
    let testsPassed = 0;
    let testsFailed = 0;

    // 测试 1: CSV 导出 (inline)
    console.log('📄 [1/2] 测试 CSV 导出 (inline)...');
    const csvUrl = `${baseUrl}/api/export?platform=${platform}&year=${year}&month=${month}&format=csv&inline=1`;
    const csvResponse = await fetch(csvUrl);

    if (!csvResponse.ok) {
      console.log(`❌ CSV 导出请求失败: ${csvResponse.status} ${csvResponse.statusText}`);
      testsFailed++;
    } else {
      const csvText = await csvResponse.text();
      if (csvText && csvText.length > 0) {
        console.log(`✅ CSV 导出成功, 大小: ${csvText.length} bytes`);
        console.log(`   内容预览: ${csvText.substring(0, 60)}...`);
        testsPassed++;
      } else {
        console.log('❌ CSV 导出为空');
        testsFailed++;
      }
    }

    // 测试 2: XLSX 导出
    console.log('');
    console.log('📊 [2/2] 测试 XLSX 导出...');
    const xlsxUrl = `${baseUrl}/api/export?platform=${platform}&year=${year}&month=${month}&format=xlsx`;
    const xlsxResponse = await fetch(xlsxUrl);

    if (!xlsxResponse.ok) {
      console.log(`❌ XLSX 导出请求失败: ${xlsxResponse.status} ${xlsxResponse.statusText}`);
      testsFailed++;
    } else {
      try {
        const buffer = await xlsxResponse.buffer();
        if (buffer && buffer.length > 0) {
          const filePath = path.join(tmpDir, `export-${Date.now()}.xlsx`);
          await fs.writeFile(filePath, buffer);
          console.log(`✅ XLSX 导出成功`);
          console.log(`   文件路径: ${filePath}`);
          console.log(`   文件大小: ${buffer.length} bytes`);
          testsPassed++;
        } else {
          console.log('❌ XLSX 导出为空');
          testsFailed++;
        }
      } catch (err: any) {
        console.log(`❌ XLSX 导出异常: ${err.message}`);
        testsFailed++;
      }
    }

    // 总结
    console.log('');
    console.log('═'.repeat(60));
    const success = testsPassed === 2;

    if (success) {
      console.log('✅ 冒烟测试通过');
      console.log(`   - CSV 导出: 成功`);
      console.log(`   - XLSX 导出: 成功`);
      process.exit(0);
    } else {
      console.log('❌ 冒烟测试失败');
      console.log(`   - 通过: ${testsPassed}/2`);
      console.log(`   - 失败: ${testsFailed}/2`);
      process.exit(1);
    }
  } catch (err: any) {
    console.log(`❌ 测试异常: ${err.message}`);
    process.exit(1);
  }
}

// 主函数
const params = parseArgs();
testExport(params).catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
