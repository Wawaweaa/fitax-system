/**
 * Worker 处理主入口
 * 负责消费队列消息并执行处理流程
 */
import path from 'path';
import fs from 'fs/promises';
import { config } from '../lib/config';
import { queue } from '../lib/queue';
import { storage } from '../lib/storage';
import { updateJobStatus } from '../lib/jobs';
import { generateParquet } from '../lib/parquet';
import { getAdapter } from '../lib/adapters/base';
import { ensureDir } from '../lib/utils';
import { FactRow, AggRow } from '../../frontend/lib/types';

// 设置工作目录
const WORK_DIR = path.join(process.cwd(), 'data', 'worker');

// 初始化
async function initialize(): Promise<void> {
  // 确保工作目录存在
  await ensureDir(WORK_DIR);

  // 日志初始化
  console.log('Worker 启动...');
  console.log(`配置: ${config().environment} 环境`);
  console.log(`存储驱动: ${config().storage.driver}`);
  console.log(`队列驱动: ${config().queue.driver}`);

  // 检查队列连接
  try {
    const queueSize = await queue().size();
    console.log(`队列连接成功, 当前队列大小: ${queueSize}`);
  } catch (err) {
    console.error('队列连接失败:', err);
    process.exit(1);
  }

  // 检查存储连接
  try {
    await storage().exists('test-connection');
    console.log('存储连接成功');
  } catch (err) {
    console.error('存储连接失败:', err);
    process.exit(1);
  }
}

/**
 * 下载文件到本地
 * @param objectKey 对象键
 * @param localPath 本地路径
 */
async function downloadFile(objectKey: string, localPath: string): Promise<void> {
  const fileData = await storage().getObject(objectKey);
  await fs.writeFile(localPath, fileData);
}

/**
 * 清理工作目录
 * @param jobDir 作业目录
 */
async function cleanupWorkDir(jobDir: string): Promise<void> {
  try {
    await fs.rm(jobDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`清理目录 ${jobDir} 失败:`, err);
  }
}

/**
 * 处理上传作业
 * @param jobId 作业 ID
 * @param uploadId 上传 ID
 * @param platform 平台
 * @param year 年份
 * @param month 月份
 * @param fileObjects 文件对象键列表
 */
async function processUploadJob(
  jobId: string,
  uploadId: string,
  platform: string,
  year: number,
  month: number,
  fileObjects: string[]
): Promise<void> {
  // 创建作业工作目录
  const jobDir = path.join(WORK_DIR, jobId);
  await ensureDir(jobDir);

  console.log(`开始处理作业: ${jobId}, 平台: ${platform}, 年份: ${year}, 月份: ${month}`);
  console.log(`文件数量: ${fileObjects.length}`);

  try {
    // 更新作业状态为处理中
    await updateJobStatus(jobId, 'processing', '开始处理文件');

    // 下载所有文件到本地
    const localFiles: string[] = [];
    for (const [index, objectKey] of fileObjects.entries()) {
      const fileName = path.basename(objectKey);
      const localPath = path.join(jobDir, fileName);

      await updateJobStatus(
        jobId,
        'processing',
        `下载文件 (${index + 1}/${fileObjects.length}): ${fileName}`
      );

      await downloadFile(objectKey, localPath);
      localFiles.push(localPath);
    }

    // 获取平台适配器
    const adapter = getAdapter(platform);

    // 执行预处理（如果适配器支持）
    if (adapter.preprocess) {
      await updateJobStatus(jobId, 'processing', '执行预处理');
      await adapter.preprocess({
        platform,
        uploadId,
        year,
        month,
        files: localFiles,
        jobId
      });
    }

    // 校验输入
    await updateJobStatus(jobId, 'processing', '校验输入文件');
    const validationResult = await adapter.validateInput({
      platform,
      uploadId,
      year,
      month,
      files: localFiles,
      jobId
    });

    if (!validationResult.valid) {
      throw new Error(`验证失败: ${validationResult.message}`);
    }

    // 处理文件
    await updateJobStatus(jobId, 'processing', '处理文件');
    const processResult = await adapter.process({
      platform,
      uploadId,
      year,
      month,
      files: localFiles,
      jobId
    });

    // 记录警告信息
    if (processResult.warnings.length > 0) {
      await updateJobStatus(
        jobId,
        'processing',
        `处理完成，存在警告: ${processResult.warnings.length} 条`
      );

      // 保存警告到对象存储
      const warningsKey = `jobs/${jobId}/warnings.json`;
      await storage().putObject(
        warningsKey,
        Buffer.from(JSON.stringify(processResult.warnings, null, 2)),
        { contentType: 'application/json' }
      );
    }

    // 生成事实表 Parquet
    if (processResult.factRows.length > 0) {
      await updateJobStatus(
        jobId,
        'processing',
        `生成事实表 Parquet (${processResult.factRows.length} 行)`
      );

      // 生成并上传 Parquet 文件
      await generateParquet(processResult.factRows, {
        type: 'fact',
        platform,
        uploadId,
        jobId,
        year,
        month,
        outputDir: jobDir,
        uploadToStorage: true
      });
    }

    // 生成聚合表 Parquet
    if (processResult.aggRows.length > 0) {
      await updateJobStatus(
        jobId,
        'processing',
        `生成聚合表 Parquet (${processResult.aggRows.length} 行)`
      );

      // 生成并上传 Parquet 文件
      await generateParquet(processResult.aggRows, {
        type: 'agg',
        platform,
        uploadId,
        jobId,
        year,
        month,
        outputDir: jobDir,
        uploadToStorage: true
      });
    }

    // 执行清理（如果适配器支持）
    if (adapter.cleanup) {
      await updateJobStatus(jobId, 'processing', '执行清理');
      await adapter.cleanup({
        platform,
        uploadId,
        year,
        month,
        files: localFiles,
        jobId
      });
    }

    // 更新作业状态为完成
    await updateJobStatus(
      jobId,
      'completed',
      `处理完成: 事实表 ${processResult.factRows.length} 行, 聚合表 ${processResult.aggRows.length} 行`
    );

    console.log(`作业 ${jobId} 处理完成`);
  } catch (err) {
    console.error(`处理作业 ${jobId} 失败:`, err);

    // 更新作业状态为失败
    await updateJobStatus(
      jobId,
      'failed',
      `处理失败: ${err.message}`
    );
  } finally {
    // 清理工作目录
    await cleanupWorkDir(jobDir);
  }
}

/**
 * 主循环，从队列获取并处理作业
 */
async function mainLoop(): Promise<void> {
  console.log('开始主循环...');

  while (true) {
    try {
      // 从队列获取作业
      const job = await queue().reserve({ timeout: 30 });

      // 如果没有作业，等待并继续
      if (!job) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`收到作业: ${job.id}`);

      // 解析作业数据
      const { jobId, uploadId, platform, year, month, fileObjects } = job.payload;

      // 处理作业
      await processUploadJob(
        jobId,
        uploadId,
        platform,
        parseInt(year, 10),
        parseInt(month, 10),
        fileObjects
      );

      // 确认作业完成
      await queue().ack(job.id);
    } catch (err) {
      console.error('处理作业失败:', err);

      // 等待后继续
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// 程序入口
(async function main() {
  try {
    // 初始化
    await initialize();

    // 启动主循环
    await mainLoop();
  } catch (err) {
    console.error('Worker 启动失败:', err);
    process.exit(1);
  }
})();