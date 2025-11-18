/**
 * 端到端冒烟测试
 * 验证完整链路：上传 → 处理 → Worker 消费 → 预览 → 导出
 */
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USER_ID = process.env.DEFAULT_USER_ID || 'test-user-001';
const PROJECT_ROOT = path.join(process.cwd(), '..');
const WECHAT_VIDEO_SAMPLE = path.join(PROJECT_ROOT, 'demo-视频号订单结算8月_样例_251026.xlsx');

// 等待工具
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 上传文件
async function uploadFile() {
  console.log('\n' + '='.repeat(60));
  console.log('步骤 1: 上传文件');
  console.log('='.repeat(60));

  const form = new FormData();
  form.append('platform', 'wechat_video');
  form.append('settlement', fs.createReadStream(WECHAT_VIDEO_SAMPLE));

  const response = await axios.post(`${API_BASE_URL}/api/upload`, form, {
    headers: {
      ...form.getHeaders(),
      'x-user-id': TEST_USER_ID,
    },
  });

  const uploadId = response.data.files[0].uploadId;
  const contentHash = response.data.files[0].contentHash;
  const objectKey = response.data.files[0].objectKey;

  console.log(`✅ 上传成功`);
  console.log(`   uploadId: ${uploadId}`);
  console.log(`   contentHash: ${contentHash.substring(0, 16)}...`);
  console.log(`   objectKey: ${objectKey}`);
  console.log(`   isDuplicateFile: ${response.data.files[0].isDuplicateFile}`);

  return { uploadId, contentHash, objectKey };
}

// 触发处理
async function processFile(uploadId: string) {
  console.log('\n' + '='.repeat(60));
  console.log('步骤 2: 触发处理');
  console.log('='.repeat(60));

  const response = await axios.post(
    `${API_BASE_URL}/api/process`,
    {
      platform: 'wechat_video',
      year: 2025,
      month: 10,
      mode: 'merge',
      uploads: {
        settlementUploadId: uploadId,
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': TEST_USER_ID,
      },
    }
  );

  const jobId = response.data.data.jobId;
  console.log(`✅ 处理已入队`);
  console.log(`   jobId: ${jobId}`);
  console.log(`   status: ${response.data.data.status}`);

  return jobId;
}

// 等待作业完成
async function waitForJobCompletion(jobId: string, maxWaitSeconds: number = 60) {
  console.log('\n' + '='.repeat(60));
  console.log('步骤 3: 等待 Worker 处理完成');
  console.log('='.repeat(60));

  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}`, {
        headers: {
          'x-user-id': TEST_USER_ID,
        },
      });

      const status = response.data.status;
      const progress = response.data.progress || 0;
      const message = response.data.message;

      if (status !== lastStatus) {
        console.log(`   状态: ${status}, 进度: ${progress}%, 消息: ${message}`);
        lastStatus = status;
      }

      if (status === 'completed' || status === 'succeeded') {
        console.log(`✅ 作业处理完成`);
        console.log(`   耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        return response.data;
      }

      if (status === 'failed') {
        console.log(`❌ 作业处理失败: ${message}`);
        return null;
      }

      await sleep(1000);
    } catch (err: any) {
      // 作业可能还未创建
      await sleep(1000);
    }
  }

  console.log(`❌ 等待超时 (${maxWaitSeconds}s)`);
  return null;
}

// 预览数据
async function previewData() {
  console.log('\n' + '='.repeat(60));
  console.log('步骤 4: 预览数据');
  console.log('='.repeat(60));

  const response = await axios.get(`${API_BASE_URL}/api/preview`, {
    params: {
      platform: 'wechat_video',
      year: 2025,
      month: 10,
      view: 'fact',
      pageSize: 5,
    },
    headers: {
      'x-user-id': TEST_USER_ID,
    },
  });

  console.log('   原始响应 JSON:', JSON.stringify(response.data, null, 2));

  const payload = response.data?.data ?? {};
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const total = typeof payload?.pagination?.total === 'number'
    ? payload.pagination.total
    : 0;

  console.log(`✅ 预览成功`);
  console.log(`   总行数: ${total}`);
  console.log(`   返回行数: ${rows.length}`);

  if (rows.length > 0) {
    console.log(`   第一行示例:`, JSON.stringify(rows[0], null, 2));
  }

  return { total, rows };
}

// 导出数据
async function exportData() {
  console.log('\n' + '='.repeat(60));
  console.log('步骤 5: 导出数据');
  console.log('='.repeat(60));

  const response = await axios.get(`${API_BASE_URL}/api/export`, {
    params: {
      platform: 'wechat_video',
      year: 2025,
      month: 10,
      view: 'fact',
      format: 'xlsx',
    },
    headers: {
      'x-user-id': TEST_USER_ID,
    },
    responseType: 'arraybuffer',
  });

  const contentType = response.headers['content-type'];
  const contentDisposition = response.headers['content-disposition'];
  const size = response.data.byteLength;

  console.log(`✅ 导出成功`);
  console.log(`   Content-Type: ${contentType}`);
  console.log(`   Content-Disposition: ${contentDisposition}`);
  console.log(`   文件大小: ${(size / 1024).toFixed(2)} KB`);

  // 保存到本地验证
  const outputPath = path.join(process.cwd(), 'data', 'temp', 'smoke-test-export.xlsx');
  fs.writeFileSync(outputPath, response.data);
  console.log(`   已保存到: ${outputPath}`);

  return { size, outputPath };
}

// 主流程
async function main() {
  console.log('🧪 开始端到端冒烟测试');
  console.log(`🌐 API 地址: ${API_BASE_URL}`);
  console.log(`👤 用户ID: ${TEST_USER_ID}`);
  console.log(`📁 测试文件: ${path.basename(WECHAT_VIDEO_SAMPLE)}`);

  const results: Record<string, any> = {};

  try {
    // 步骤 1: 上传
    const uploadResult = await uploadFile();
    results.upload = uploadResult;

    // 步骤 2: 处理
    const jobId = await processFile(uploadResult.uploadId);
    results.jobId = jobId;

    // 步骤 3: 等待完成
    const jobResult = await waitForJobCompletion(jobId);
    if (!jobResult) {
      throw new Error('作业处理失败或超时');
    }
    results.job = jobResult;

    // 步骤 4: 预览
    const previewResult = await previewData();
    if (previewResult.total === 0) {
      throw new Error('预览数据为空');
    }
    results.preview = previewResult;

    // 步骤 5: 导出
    const exportResult = await exportData();
    results.export = exportResult;

    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('✨ 端到端测试通过！');
    console.log('='.repeat(60));
    console.log(`上传: ${results.upload.uploadId}`);
    console.log(`作业: ${results.jobId} (${results.job.status})`);
    console.log(`预览: ${results.preview.total} 行数据`);
    console.log(`导出: ${(results.export.size / 1024).toFixed(2)} KB`);

    // 保存结果
    const resultPath = path.join(process.cwd(), 'data', 'temp', 'smoke-test-result.json');
    fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
    console.log(`\n📝 结果已保存到: ${resultPath}`);

    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ 测试失败:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
