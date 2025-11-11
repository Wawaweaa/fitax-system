/**
 * Worker测试脚本
 *
 * 本脚本用于测试Worker的功能，模拟上传文件、提交处理作业并观察结果
 * 运行方式：ts-node scripts/test-worker.ts
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { storage } from '../lib/storage';
import { queue } from '../lib/queue';
import { config } from '../lib/config';
import { registerUpload } from '../lib/uploads';
import { createJob } from '../lib/jobs';
import { ProcessRequest, Platform } from '../lib/types';
import { init, processJob } from '../worker';

// 测试文件路径
const TEST_FILES = {
  xiaohongshu: '../tests/samples/xiaohongshu_sample.csv',
  douyin: '../tests/samples/douyin_sample.csv',
  wechat_video: '../tests/samples/wechat_video_sample.csv'
};

// 测试用户ID
const TEST_USER_ID = 'test-user-001';

// 测试平台
const TEST_PLATFORM: Platform = 'xiaohongshu';

// 测试年月
const TEST_YEAR = 2024;
const TEST_MONTH = 10;

/**
 * 运行测试
 */
async function runTest() {
  try {
    console.log('初始化Worker...');
    await init();

    // 确保测试目录存在
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    await ensureDir(uploadDir);

    // 准备测试文件
    const testFilePath = path.resolve(__dirname, TEST_FILES[TEST_PLATFORM]);
    const fileName = path.basename(testFilePath);

    try {
      await fs.access(testFilePath);
    } catch (err) {
      console.error(`测试文件不存在: ${testFilePath}`);
      console.log('请创建测试文件目录和文件，或修改TEST_FILES配置');
      process.exit(1);
    }

    console.log(`使用测试文件: ${fileName}`);

    // 读取文件内容
    const fileContent = await fs.readFile(testFilePath);

    // 计算文件哈希
    const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    // 创建上传记录
    const uploadId = `upload-${crypto.randomBytes(4).toString('hex')}`;
    const objectKey = `uploads/${TEST_USER_ID}/${uploadId}/${fileName}`;

    // 保存文件到存储
    console.log('上传文件到存储...');
    await storage().putObject(objectKey, fileContent);

    // 创建上传记录
    console.log('创建上传记录...');
    await registerUpload({
      id: uploadId,
      userId: TEST_USER_ID,
      originalFilename: fileName,
      size: fileContent.length,
      fileType: path.extname(fileName).substring(1),
      contentHash,
      objectKey,
      uploadedAt: new Date(),
      isDuplicate: false
    });

    // 创建处理作业
    console.log('创建处理作业...');
    const jobId = `job-${crypto.randomBytes(4).toString('hex')}`;

    // 作业请求
    const processRequest: ProcessRequest = {
      platform: TEST_PLATFORM,
      year: TEST_YEAR,
      month: TEST_MONTH,
      mode: 'merge',
      uploads: {
        settlementUploadId: uploadId
      }
    };

    // 创建作业记录
    await createJob({
      id: jobId,
      userId: TEST_USER_ID,
      platform: TEST_PLATFORM,
      uploadId: uploadId,
      datasetId: 'test-dataset-001',
      year: TEST_YEAR,
      month: TEST_MONTH,
      metadata: {
        requestPayload: processRequest
      }
    });

    // 处理作业
    console.log(`处理作业: ${jobId}...`);
    await processJob(jobId, processRequest);

    console.log('测试完成！');
    process.exit(0);
  } catch (err) {
    console.error('测试失败:', err);
    process.exit(1);
  }
}

/**
 * 确保目录存在
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch (err) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// 运行测试
runTest();