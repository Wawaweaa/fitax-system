// --- start.ts 顶部：先加载 .env.local ---
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

// 打一行环境自检日志（确认 env 是否读到）
console.log('[Worker env]', {
  queue: process.env.QUEUE_DRIVER,
  urlSet: !!(process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL),
  tokenSet: !!(process.env.UPSTASH_REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
  dataDir: process.env.DATA_DIR,
  cwd: process.cwd()
});

// 再导入其余模块
import { program } from 'commander';
import { init, start } from './index';

// 为本进程生成一个唯一的实例ID
const workerInstanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
console.log('[worker-instance] started', { workerInstanceId, pid: process.pid });


/**
 * Worker启动脚本
 * 用于从命令行启动Worker进程
 */
import { program } from 'commander';
import { init, start } from './index';

// 设置命令行选项
program
  .name('fitax-worker')
  .description('Fitax结算系统Worker进程')
  .version('1.0.0');

// 添加启动命令
program
  .command('start')
  .description('启动Worker进程')
  .option('-i, --interval <ms>', '轮询间隔（毫秒）', '1000')
  .option('-j, --max-jobs <n>', '最大处理作业数（0表示无限）', '0')
  .action(async (options) => {
    try {
      console.log('正在启动Fitax Worker...');

      // 初始化Worker
      await init();

      // 启动主循环
      const pollInterval = parseInt(options.interval, 10);
      const maxJobs = parseInt(options.maxJobs, 10);

      console.log(`轮询间隔: ${pollInterval}ms`);
      console.log(`最大作业数: ${maxJobs === 0 ? '无限' : maxJobs}`);

      await start(pollInterval, maxJobs);
    } catch (err) {
      console.error('Worker启动失败:', err);
      process.exit(1);
    }
  });

// 添加单次作业处理命令
program
  .command('process <jobId>')
  .description('处理单个作业')
  .action(async (jobId) => {
    try {
      console.log(`处理作业: ${jobId}`);

      // 初始化Worker
      await init();

      // 导入processJob函数
      const { processJob } = await import('./index');

      // 获取作业信息
      const { getJob } = await import('../lib/jobs');
      const job = await getJob(jobId);

      if (!job) {
        console.error(`找不到作业: ${jobId}`);
        process.exit(1);
      }

      // 处理作业
      await processJob(jobId, job.payload);

      console.log(`作业 ${jobId} 处理完成`);
      process.exit(0);
    } catch (err) {
      console.error(`作业处理失败:`, err);
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
