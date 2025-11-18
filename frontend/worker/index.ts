/**
 * Worker入口点 - 处理队列中的作业
 *
 * 主要职责：
 * 1. 从队列中获取作业
 * 2. 更新作业状态
 * 3. 根据平台类型调用相应的适配器处理数据
 * 4. 生成Parquet文件
 * 5. 更新有效数据集
 * 6. 完成作业
 */
import { Queue } from '../lib/queue';
import { storage } from '../lib/storage';
import { config } from '../lib/config';
import {
  getJobInfo,
  updateJob,
  createJob,
  deleteJob
} from '../lib/jobs';
import { ProcessRequest, Platform } from '../lib/types';
import { getUploadRecord } from '../lib/uploads';
import {
  generateDatasetId,
  createDataset,
  getEffectiveDataset,
  supersede
} from '../lib/datasets';
import { getAdapter } from './adapters';
import { processData } from './processor';

// 队列实例
let queue: Queue;
// 从启动脚本注入/或本模块内兜底生成一个实例ID（用于定位哪个进程在处理作业）
const workerInstanceId = (global as any).__WORKER_INSTANCE_ID__ || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 初始化Worker
 */
export async function init(): Promise<void> {
  console.log('初始化Worker...');

  // 从配置中获取队列
  queue = require('../lib/queue').queue();

  console.log('Worker初始化完成');
}

/**
 * Worker主循环
 * @param pollInterval 轮询间隔（毫秒）
 * @param maxJobs 最大处理作业数（0表示无限）
 */
export async function start(
  pollInterval: number = 1000,
  maxJobs: number = 0
): Promise<void> {
  console.log('启动Worker主循环...');

  let processedJobs = 0;
  let running = true;

  // 捕获终止信号
  process.on('SIGINT', () => {
    console.log('收到终止信号，等待当前作业完成...');
    running = false;
  });

  // 主循环
  while (running && (maxJobs === 0 || processedJobs < maxJobs)) {
    try {
      // 从队列中获取作业
      const job = await queue.reserve({
        timeout: 30 // 30秒超时
      });

      if (job) {
        // job.payload.jobId 才是真正的作业ID，job.id 是队列项目ID
        const jobId = job.payload.jobId;
        console.log(`处理作业: ${jobId} (队列项: ${job.id})`);
        console.log('[worker-debug] start', { workerInstanceId, jobId, queueMessageId: job.id });

        // 处理作业
        await processJob(jobId, job.payload);

        // 确认作业完成
        await queue.ack(job.id);

        processedJobs++;
      } else {
        // 无作业，等待
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } catch (err) {
      console.error('Worker循环错误:', err);
      // 错误恢复等待
      await new Promise(resolve => setTimeout(resolve, pollInterval * 3));
    }
  }

  console.log(`Worker已停止，共处理${processedJobs}个作业`);
}

/**
 * 处理单个作业
 * @param jobId 作业ID
 * @param payload 作业负载
 */
export async function processJob(
  jobId: string,
  payload: any
): Promise<void> {
  try {
    // 获取作业详情（带重试机制，解决文件写入竞态问题）
    let job = null;
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      job = await getJobInfo(jobId);
      if (job) {
        console.log(`[Worker] 成功获取作业信息: ${jobId}${i > 0 ? ` (重试 ${i} 次)` : ''}`);
        break;
      }
      const delay = 200 * (i + 1); // 递增退避：200ms, 400ms, 600ms, 800ms, 1000ms
      console.log(`[Worker] 作业 ${jobId} 暂未找到，${delay}ms 后重试 (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!job) {
      throw new Error(`找不到作业: ${jobId} (已重试 ${maxRetries} 次)`);
    }

    // 作业已经处理过
    if (job.status === 'completed' || job.status === 'succeeded') {
      console.log(`作业 ${jobId} 已处理，跳过`);
      return;
    }

    // 作业已失败
    if (job.status === 'failed') {
      console.log(`作业 ${jobId} 已失败，跳过`);
      return;
    }

    // 更新作业状态为处理中
    await updateJob(jobId, {
      status: 'processing',
      progress: 0,
      message: '开始处理作业'
    });

    // 确保payload存在
    if (!payload) {
      throw new Error('作业负载为空');
    }

    // 解析请求数据
    const request = payload as ProcessRequest;

    // 验证请求参数
    if (!request || !request.platform || !request.year || !request.month) {
      throw new Error('作业参数不完整');
    }

    // 优先使用 payload 中的 fileMetadata（新版本）
    // 如果不存在则降级到查询 uploadId（兼容旧版本）
    let settlementUpload: any;
    let ordersUpload: any = null;

    if (request.fileMetadata) {
      // 新版本：直接使用 payload 中的文件元数据
      console.log('[worker] 使用 payload 中的 fileMetadata');
      settlementUpload = {
        ...request.fileMetadata.settlement,
        userId: request.userId  // 添加 userId（fileMetadata 中没有此字段）
      };

      if (request.fileMetadata.orders) {
        ordersUpload = {
          ...request.fileMetadata.orders,
          userId: request.userId  // 添加 userId（fileMetadata 中没有此字段）
        };
      }

      // 验证必要字段
      if (!settlementUpload?.objectKey || !settlementUpload?.id) {
        throw new Error('payload.fileMetadata.settlement 缺少必要字段 (objectKey 或 id)');
      }
    } else if (request.uploads) {
      // 旧版本降级：查询上传记录（保留兼容性）
      console.log('[worker] 降级：从 uploadId 查询上传记录');
      settlementUpload = await getUploadRecord(request.uploads.settlementUploadId);
      if (!settlementUpload) {
        throw new Error(`找不到结算上传: ${request.uploads.settlementUploadId}`);
      }

      if (request.uploads.ordersUploadId) {
        ordersUpload = await getUploadRecord(request.uploads.ordersUploadId);
        if (!ordersUpload) {
          throw new Error(`找不到订单上传: ${request.uploads.ordersUploadId}`);
        }
      }
    } else {
      throw new Error('payload 缺少 fileMetadata 或 uploads 字段');
    }

    // 更新进度
    await updateJob(jobId, {
      progress: 10,
      message: '已验证上传文件'
    });

    // 获取平台适配器
    const adapter = getAdapter(request.platform as Platform);

    // 准备处理上下文
    const context = {
      jobId,
      userId: request.userId,  // 使用 request.userId 而不是 settlementUpload.userId
      platform: request.platform,
      year: request.year,
      month: request.month,
      mode: request.mode || 'merge',
      settlementUpload,
      ordersUpload
    };

    // 更新进度
    await updateJob(jobId, {
      progress: 20,
      message: '开始处理数据'
    });

    // 处理数据（带详细错误日志）
    let result;
    try {
      console.log(`[Worker] 开始 processData: jobId=${jobId}, platform=${context.platform}, year=${context.year}, month=${context.month}`);
      console.log(`[Worker] 文件信息: settlementKey=${context.settlementUpload.objectKey}`);
      result = await processData(context, adapter);
      console.log(`[Worker] processData 完成: factCount=${result.factCount}, aggCount=${result.aggCount}, warnings=${result.warnings.length}`);
    } catch (err: any) {
      console.error(`[Worker] processData 失败:`, err);
      console.error(`[Worker] 错误堆栈:`, err.stack);
      console.error(`[Worker] 上下文信息:`, JSON.stringify({
        jobId: context.jobId,
        platform: context.platform,
        year: context.year,
        month: context.month,
        settlementKey: context.settlementUpload?.objectKey,
        hasOrders: !!context.ordersUpload
      }, null, 2));
      throw new Error(`数据处理失败: ${err.message || err}`);
    }

    // 更新进度
    await updateJob(jobId, {
      progress: 90,
      message: '数据处理完成，更新数据集'
    });

    // 获取或创建数据集
    const datasetId = generateDatasetId(
      request.userId,  // 使用 request.userId
      request.platform,
      request.year,
      request.month
    );

    // 检查是否有现有数据集
    const existingDataset = await getEffectiveDataset(
      request.userId,  // 使用 request.userId
      request.platform,
      request.year,
      request.month
    );

    const previousJobIds = Array.isArray(existingDataset?.metadata?.jobIds)
      ? existingDataset?.metadata?.jobIds as string[]
      : [];
    const jobIds = Array.from(new Set([...previousJobIds, jobId]));

    if (existingDataset && request.mode === 'replace') {
      // 替换模式：标记现有数据集为已替代
      await supersede(existingDataset.id, datasetId);
    }

    // 创建或更新数据集
    await createDataset({
      id: datasetId,
      userId: settlementUpload.userId,
      platform: request.platform,
      year: request.year,
      month: request.month,
      uploadId: settlementUpload.id,
      metadata: {
        mode: request.mode || 'merge',
        jobId,
        jobIds,
        factCount: result.factCount,
        aggCount: result.aggCount,
        warnings: result.warnings
      }
    });

    // 拉取最新 dataset 以记录最终状态
    const datasetAfter = await getEffectiveDataset(
      request.userId,
      request.platform,
      request.year,
      request.month
    );
    console.log('[worker-debug] done', {
      jobId,
      platform: request.platform,
      year: request.year,
      month: request.month,
      factCount: result.factCount,
      aggCount: result.aggCount,
      warnings: result.warnings?.length ?? 0,
      datasetIdAfter: datasetAfter?.id,
      metadataAfter: datasetAfter?.metadata,
    });

    // 完成作业
    await updateJob(jobId, {
      status: 'completed',
      message: '作业处理成功',
      progress: 100,
      metadata: {
        datasetId,
        factCount: result.factCount,
        aggCount: result.aggCount,
        warnings: result.warnings
      }
    });

    console.log(`作业 ${jobId} 处理完成`);

  } catch (err) {
    console.error(`作业 ${jobId} 处理失败:`, err);

    // 更新作业状态为失败
    await updateJob(jobId, {
      status: 'failed',
      message: err.message || '未知错误',
      progress: 0
    });

    // 重新抛出错误以便上层捕获
    throw err;
  }
}

/**
 * CLI入口点
 */
if (require.main === module) {
  // 直接运行此文件
  (async () => {
    try {
      await init();
      await start();
    } catch (err) {
      console.error('Worker启动失败:', err);
      process.exit(1);
    }
  })();
}
