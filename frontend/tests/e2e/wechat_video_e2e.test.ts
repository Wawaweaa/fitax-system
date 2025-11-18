/**
 * 微信视频号全流程E2E测试
 *
 * 测试从上传、处理、到预览和导出的全链路流程
 */
import path from 'path';
import fs from 'fs/promises';
import { WechatVideoAdapter } from '../../worker/adapters/wechat_video';
import { storage } from '../../lib/storage';
import { uploadFile, getUploadRecord } from '../../lib/uploads';
import { generateDatasetId, getEffectiveDataset } from '../../lib/datasets';
import { createJob, getJobInfo } from '../../lib/jobs';
import { processJob } from '../../worker';
import { queryFactData, queryAggData } from '@/lib/duckdb';

// 测试数据路径
const TEST_DATA_DIR = path.join(process.cwd(), '..', 'demo-data');
const MODEL_SAMPLE_FILE = path.join(TEST_DATA_DIR, 'demo-1024-视频号模型_规则样例_251026.xlsx');
const ORDER_SAMPLE_FILE = path.join(TEST_DATA_DIR, 'demo-视频号订单结算8月_样例_251026.xlsx');

// 测试参数
const TEST_PLATFORM = 'wechat_video';
const TEST_YEAR = 2024;
const TEST_MONTH = 10;
const TEST_USER_ID = 'test-user-001';

// 全局变量
let settlementUploadId: string;
let jobId: string;
let datasetId: string;

/**
 * 微信视频号E2E测试
 */
describe('WechatVideoAdapter - E2E测试', () => {

  // 测试前确保测试文件存在
  beforeAll(async () => {
    // 检查文件是否存在
    await expect(fs.access(MODEL_SAMPLE_FILE)).resolves.not.toThrow();
    await expect(fs.access(ORDER_SAMPLE_FILE)).resolves.not.toThrow();

    // 预生成数据集ID
    datasetId = generateDatasetId(
      TEST_USER_ID,
      TEST_PLATFORM,
      TEST_YEAR,
      TEST_MONTH
    );
  });

  test('1. 上传结算文件', async () => {
    // 读取测试文件
    const fileContent = await fs.readFile(ORDER_SAMPLE_FILE);
    const fileName = path.basename(ORDER_SAMPLE_FILE);

    // 上传文件
    const uploadResult = await uploadFile(
      fileName,
      fileContent,
      TEST_USER_ID
    );

    // 验证上传结果
    expect(uploadResult).toBeDefined();
    expect(uploadResult.uploadId).toBeDefined();

    // 保存上传ID
    settlementUploadId = uploadResult.uploadId;

    // 获取上传记录
    const uploadRecord = await getUploadRecord(settlementUploadId);
    expect(uploadRecord).toBeDefined();
    expect(uploadRecord?.userId).toBe(TEST_USER_ID);
    expect(uploadRecord?.fileName).toBe(fileName);
  });

  test('2. 创建处理作业', async () => {
    // 创建处理作业
    const jobResult = await createJob({
      type: 'process',
      userId: TEST_USER_ID,
      payload: {
        platform: TEST_PLATFORM,
        year: TEST_YEAR,
        month: TEST_MONTH,
        mode: 'merge',
        uploads: {
          settlementUploadId
        }
      }
    });

    // 验证作业创建结果
    expect(jobResult).toBeDefined();
    expect(jobResult.id).toBeDefined();

    // 保存作业ID
    jobId = jobResult.id;

    // 获取作业信息
    const jobInfo = await getJobInfo(jobId);
    expect(jobInfo).toBeDefined();
    expect(jobInfo?.status).toBe('pending');
  });

  test('3. 执行作业处理', async () => {
    // 获取作业信息
    const jobInfo = await getJobInfo(jobId);

    // 处理作业
    await processJob(jobId, jobInfo?.payload);

    // 获取更新后的作业信息
    const updatedJob = await getJobInfo(jobId);
    expect(updatedJob).toBeDefined();
    expect(updatedJob?.status).toBe('completed');

    // 验证作业进度
    expect(updatedJob?.progress).toBe(100);

    // 验证作业元数据
    expect(updatedJob?.metadata).toBeDefined();
    expect(updatedJob?.metadata?.datasetId).toBe(datasetId);
  });

  test('4. 验证数据集', async () => {
    // 获取数据集
    const dataset = await getEffectiveDataset(
      TEST_USER_ID,
      TEST_PLATFORM,
      TEST_YEAR,
      TEST_MONTH
    );

    // 验证数据集信息
    expect(dataset).toBeDefined();
    expect(dataset?.id).toBe(datasetId);
    expect(dataset?.userId).toBe(TEST_USER_ID);
    expect(dataset?.platform).toBe(TEST_PLATFORM);
    expect(dataset?.year).toBe(TEST_YEAR);
    expect(dataset?.month).toBe(TEST_MONTH);
    expect(dataset?.status).toBe('active');
  });

  test('5. 查询事实表数据', async () => {
    // 查询事实表数据
    const factRows = await queryFactData(
      TEST_PLATFORM,
      TEST_YEAR,
      TEST_MONTH,
      undefined, // 不过滤SKU
      100,       // 最多100行
      0,         // 从第一行开始
      TEST_USER_ID
    );

    // 验证事实表数据
    expect(factRows).toBeDefined();
    expect(factRows.length).toBeGreaterThan(0);

    // 验证第一行数据
    const firstRow = factRows[0];
    expect(firstRow).toBeDefined();
    expect(firstRow.platform).toBe(TEST_PLATFORM);
    expect(firstRow.year).toBe(TEST_YEAR);
    expect(firstRow.month).toBe(TEST_MONTH);
    expect(firstRow.row_key).toBeDefined();
    expect(firstRow.row_hash).toBeDefined();
  });

  test('6. 查询聚合表数据', async () => {
    // 查询聚合表数据
    const aggRows = await queryAggData(
      TEST_PLATFORM,
      TEST_YEAR,
      TEST_MONTH,
      undefined, // 不过滤SKU
      100,       // 最多100行
      0,         // 从第一行开始
      TEST_USER_ID
    );

    // 验证聚合表数据
    expect(aggRows).toBeDefined();
    expect(aggRows.length).toBeGreaterThan(0);

    // 验证第一行数据
    const firstRow = aggRows[0];
    expect(firstRow).toBeDefined();
    expect(firstRow.platform).toBe(TEST_PLATFORM);
    expect(firstRow.year).toBe(TEST_YEAR);
    expect(firstRow.month).toBe(TEST_MONTH);
    expect(firstRow.internal_sku).toBeDefined();
    expect(firstRow.qty_sold_sum).toBeDefined();
  });
});