# Dev + Test 指令模板

## 环境准备
```
pm install
mkdir -p data uploads expected tmp
cp .env.example .env
```
- 填写 `.env`：`MAX_UPLOAD_MB=50`，`ALLOWED_EXT=.xlsx`，`STORAGE_DRIVER=s3或ali-oss`，`QUEUE_DRIVER=upstash|sqs|mns` 等。

## Storage/Queue 驱动
- 开发期可用 `StorageStub`（写本地）、`QueueStub`（内存）模拟。
- 真机测试需要配置 AWS/阿里云凭证。

## 常用命令
```
npm run dev
npm run build
npm run lint
npm run test
npm run e2e -- --platform wechat_video --input uploads/samples/demo-1024-视频号模型_规则样例_251026.xlsx
```
- 其他平台：`npm run e2e:xhs`、`npm run e2e:douyin`（自行配置）。

## 阶段性测试
1. **单元测试**：
   - Storage/Queue driver 切换。
   - Douyin 字段清洗（空白/注释）。
   - 视频号 H/I/J/L/M/N 条件。
2. **集成测试**：
   - dev-local：上传→处理→预览→导出全流程。
   - Worker：模拟队列任务，确认 Parquet/导出生成。
3. **E2E**：
   - 运行 `npm run e2e:*`。
   - 导出 `fact.csv`、`agg.csv` 至 `tmp/<platform>/`。
   - 与 `expected/expected_fact.csv`, `expected/expected_agg.csv` `diff`。

## 部署验证
- staging-intl：
  1. 配置 `.env.staging`（S3、Queue、Postgres）。
  2. CI 部署 Vercel + Worker。
  3. 运行 `npm run e2e:staging`（远程执行）。
- prod-cn：
  1. 配置 `.env.prod`（OSS、MNS、ApsaraDB、SLS）。
  2. 运行 shadow 任务验证。
  3. 双写期间记录核对报告。

## 运维脚本
- `scripts/sync-parquet.ts`：S3 ↔ OSS 同步。
- `scripts/check-metrics.ts`：拉取监控指标。
- `scripts/cleanup-exports.ts`：清理过期导出。

## 通过标准
- 金样对比 `diff` = 0。
- API 响应符合 PRD。
- Storage/Queue driver 可自由切换。
- Worker 处理成功率 ≥99%，失败可重试。
- Parquet 目录结构正确。
- 部署后监控指标在阈值内。
