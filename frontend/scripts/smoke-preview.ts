#!/usr/bin/env ts-node
/**
 * 冒烟测试脚本 - 验证预览功能
 * 测试 /api/preview 端点，确保预览数据可正常返回
 */

import fetch from 'node-fetch';

// 默认参数
interface PreviewParams {
  platform: string;
  year: number;
  month: number;
  baseUrl: string;
}

// 解析命令行参数
function parseArgs(): PreviewParams {
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

async function testPreview(params: PreviewParams): Promise<boolean> {
  const { platform, year, month, baseUrl } = params;

  console.log('📊 冒烟测试：预览功能');
  console.log('═'.repeat(60));
  console.log(`参数: platform=${platform}, year=${year}, month=${month}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log('');

  try {
    // 测试 fact 视图
    console.log('📋 [1/2] 获取 fact 预览视图...');
    const factUrl = `${baseUrl}/api/preview?platform=${platform}&year=${year}&month=${month}&view=fact`;
    const factResponse = await fetch(factUrl);

    if (!factResponse.ok) {
      console.log(`❌ fact 视图请求失败: ${factResponse.status} ${factResponse.statusText}`);
      return false;
    }

    const factData = await factResponse.json() as { data?: any[] };
    const factRows = factData?.data || [];

    console.log(`✅ fact 视图返回 ${factRows.length} 行`);

    if (factRows.length === 0) {
      console.log('⚠️  警告: fact 视图无数据');
    } else {
      console.log(`   样本记录: ${JSON.stringify(factRows[0]).substring(0, 80)}...`);
    }

    // 测试 agg 视图
    console.log('');
    console.log('📊 [2/2] 获取 agg 聚合视图...');
    const aggUrl = `${baseUrl}/api/preview?platform=${platform}&year=${year}&month=${month}&view=agg`;
    const aggResponse = await fetch(aggUrl);

    if (!aggResponse.ok) {
      console.log(`❌ agg 视图请求失败: ${aggResponse.status} ${aggResponse.statusText}`);
      return false;
    }

    const aggData = await aggResponse.json() as { data?: any[] };
    const aggRows = aggData?.data || [];

    console.log(`✅ agg 视图返回 ${aggRows.length} 行`);

    if (aggRows.length === 0) {
      console.log('⚠️  警告: agg 视图无数据');
    } else {
      console.log(`   样本记录: ${JSON.stringify(aggRows[0]).substring(0, 80)}...`);
    }

    // 总结
    console.log('');
    console.log('═'.repeat(60));
    const success = factRows.length > 0 && aggRows.length > 0;

    if (success) {
      console.log('✅ 冒烟测试通过');
      console.log(`   - fact 视图: ${factRows.length} 行`);
      console.log(`   - agg 视图: ${aggRows.length} 行`);
      process.exit(0);
    } else {
      console.log('❌ 冒烟测试失败: 预览数据不完整');
      console.log(`   - fact 视图: ${factRows.length} 行 (期望 > 0)`);
      console.log(`   - agg 视图: ${aggRows.length} 行 (期望 > 0)`);
      process.exit(1);
    }
  } catch (err: any) {
    console.log(`❌ 测试异常: ${err.message}`);
    process.exit(1);
  }
}

// 主函数
const params = parseArgs();
testPreview(params).catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
