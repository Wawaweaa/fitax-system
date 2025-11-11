/**
 * 测试上传 API 脚本
 * 用于验证 /api/upload 的上传、去重功能
 */
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USER_ID = process.env.DEFAULT_USER_ID || 'test-user-001';

// 测试样本文件路径
const PROJECT_ROOT = path.join(process.cwd(), '..');
const WECHAT_VIDEO_SAMPLE = path.join(PROJECT_ROOT, 'demo-视频号订单结算8月_样例_251026.xlsx');

interface UploadResponse {
  files: Array<{
    uploadId: string;
    contentHash: string;
    isDuplicateFile: boolean;
    fileType: string;
    originalFilename: string;
    objectKey: string;
  }>;
  data: {
    files: Array<any>;
  };
}

async function testUpload(platform: string, filePath: string, fileType: string = 'settlement') {
  console.log(`\n📤 测试上传: ${path.basename(filePath)}`);
  console.log(`   平台: ${platform}`);
  console.log(`   类型: ${fileType}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return null;
  }

  const form = new FormData();
  form.append('platform', platform);
  form.append(fileType, fs.createReadStream(filePath));

  try {
    const response = await axios.post<UploadResponse>(`${API_BASE_URL}/api/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'x-user-id': TEST_USER_ID,
      },
    });

    console.log(`✅ 上传成功 (HTTP ${response.status})`);
    console.log('\n📋 响应数据:');
    console.log(JSON.stringify(response.data, null, 2));

    // 提取关键信息
    const file = response.data.files[0];
    console.log(`\n🔑 关键信息:`);
    console.log(`   uploadId: ${file.uploadId}`);
    console.log(`   contentHash: ${file.contentHash.substring(0, 16)}...`);
    console.log(`   isDuplicateFile: ${file.isDuplicateFile}`);
    console.log(`   objectKey: ${file.objectKey}`);

    return response.data;
  } catch (error: any) {
    console.error(`❌ 上传失败:`, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 开始测试上传 API');
  console.log(`🌐 API 地址: ${API_BASE_URL}`);
  console.log(`👤 用户ID: ${TEST_USER_ID}`);

  // 测试 1: 首次上传
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 首次上传微信视频号样本文件');
  console.log('='.repeat(60));
  const result1 = await testUpload('wechat_video', WECHAT_VIDEO_SAMPLE);

  if (!result1) {
    console.error('\n❌ 首次上传失败，终止测试');
    process.exit(1);
  }

  // 测试 2: 重复上传（验证去重）
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 重复上传同一文件（验证去重）');
  console.log('='.repeat(60));
  const result2 = await testUpload('wechat_video', WECHAT_VIDEO_SAMPLE);

  if (!result2) {
    console.error('\n❌ 重复上传失败，终止测试');
    process.exit(1);
  }

  // 验证去重逻辑
  console.log('\n' + '='.repeat(60));
  console.log('📊 去重验证结果');
  console.log('='.repeat(60));

  const firstUploadId = result1.files[0].uploadId;
  const secondUploadId = result2.files[0].uploadId;
  const isDuplicate = result2.files[0].isDuplicateFile;

  console.log(`首次上传 uploadId: ${firstUploadId}`);
  console.log(`重复上传 uploadId: ${secondUploadId}`);
  console.log(`isDuplicateFile: ${isDuplicate}`);

  if (firstUploadId === secondUploadId && isDuplicate) {
    console.log('\n✅ 去重功能正常：重复上传复用了同一个 uploadId');
  } else {
    console.log('\n❌ 去重功能异常：uploadId 不一致或未标记为重复');
    process.exit(1);
  }

  // 读取 uploads.json 验证
  console.log('\n' + '='.repeat(60));
  console.log('📄 验证 uploads.json 记录');
  console.log('='.repeat(60));

  const uploadsPath = path.join(process.cwd(), 'data', 'uploads.json');
  const uploadsContent = JSON.parse(fs.readFileSync(uploadsPath, 'utf-8'));

  const uploadRecord = uploadsContent.find((r: any) => r.id === firstUploadId);

  if (uploadRecord) {
    console.log('✅ 找到上传记录:');
    console.log(JSON.stringify(uploadRecord, null, 2));

    // 验证字段完整性
    const requiredFields = ['id', 'userId', 'platform', 'fileType', 'contentHash', 'objectKey', 'uploadedAt'];
    const missingFields = requiredFields.filter(field => !uploadRecord[field]);

    if (missingFields.length === 0) {
      console.log('\n✅ 所有必需字段完整');
    } else {
      console.log(`\n❌ 缺少字段: ${missingFields.join(', ')}`);
      process.exit(1);
    }

    // 验证字段命名（不应出现旧字段）
    const oldFields = ['uploadId', 'storedPath', 'contenthash'];
    const foundOldFields = oldFields.filter(field => uploadRecord[field] !== undefined);

    if (foundOldFields.length === 0) {
      console.log('✅ 无旧字段命名');
    } else {
      console.log(`\n❌ 发现旧字段: ${foundOldFields.join(', ')}`);
      process.exit(1);
    }
  } else {
    console.log('❌ 未找到上传记录');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ 所有测试通过！');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
