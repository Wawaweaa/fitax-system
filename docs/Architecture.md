# 技术方案与架构说明

## 1. 总览
- 应用：Next.js 14 (App Router) + TypeScript。
- 数据真相：对象存储中的 Parquet（fact/agg），DuckDB/SQL 仅作开发与查询；有效视图由最新处理结果驱动。
- 处理链路：上传 → 入队 → Worker 下载/归一化(S0) → 统一计算(S1) → 合并(merge/replace) → 写 Parquet → 更新有效视图 → 导出/预览。

## 2. 目录结构（建议）
```
├─ app/
│  └─ api/
│     ├─ upload/route.ts           # 计算 content_hash、登记 upload
│     ├─ process/route.ts          # 入队处理，支持 mode=merge|replace
│     ├─ job/[jobId]/route.ts      # 查询作业状态
│     ├─ preview/route.ts          # 视图查询（fact|agg）
│     └─ export/route.ts           # 导出 CSV/XLSX（支持 inline）
├─ lib/
│  ├─ storage/                      # Storage 接口 + driver (local/s3/alioss)
│  ├─ queue/                        # Queue 接口 + driver (inmemory/upstash/sqs)
│  ├─ adapters/                     # 平台适配器（wechat_video/xiaohongshu/douyin）
│  ├─ parquet/                      # Parquet 读写辅助
│  ├─ datasets.ts                   # merge/replace 管理、row_key/row_hash
│  ├─ uploads.ts                    # 内容哈希、去重、租户隔离
│  ├─ jobs.ts                       # 作业状态（元数据表 + storage）
│  └─ config.ts                     # 环境变量读取
├─ worker/
│  ├─ index.ts                      # 队列消费、调用适配器、写 Parquet
│  ├─ merge.ts                      # merge/replace 合并策略
│  └─ Dockerfile                    # 统一容器镜像，使用 ENV 配置
├─ tests/e2e/                       # 金样 E2E（Vitest）
├─ fixtures/                        # 平台样本
├─ expected/                        # 金样 CSV
└─ docs/                            # PRD/Architecture/etc.
```

## 3. 核心组件
### 3.1 Storage 接口
```ts
interface Storage {
  putObject(key: string, body: Buffer|Readable, opts?: PutOptions): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  list(prefix: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
}
```
- 实现：`LocalStorage`（开发）、`S3Storage`（staging-intl）、`AliOSSStorage`（prod-cn）。
- 路径：`raw/user_id=.../platform=.../file_type=.../uploaded_at=.../original.xlsx`，`parquet/user_id=.../platform=.../year=.../month=.../upload_id=.../fact.parquet`。

### 3.2 Queue 接口
```ts
interface Queue {
  enqueue(payload: any): Promise<void>;
  reserve(options?: { timeout?: number }): Promise<{ id: string; payload: any }|null>;
  ack(id: string): Promise<void>;
  fail?(id: string, err: Error): Promise<void>;
  size?(): Promise<number>;
}
```
- 实现：`InMemoryQueue`（本地）、`UpstashQueue` 或 `SQSQueue`（至少一项真实驱动）。
- 消息格式：`{ jobId, userId, platform, year, month, mode, files: {settlement?: key, orders?: key}, datasetId }`。

### 3.3 Worker 流程
1. `queue.reserve()` 获取任务。
2. 下载 `files` 到临时目录。
3. 调用 `adapter.preprocess/validateInput/process`：输出标准化行、事实/汇总数据。
4. 根据 `mode`
   - merge：读取有效版本 → 按 row_key/row_hash upsert → 写新 Parquet → 更新 `effective_upload_id`。
   - replace：标记旧版本 `superseded` → 写新 Parquet → 更新有效视图。
5. 上传 Parquet → 更新 metadata（datasets/upload_rows_index）。
6. 日志 & 作业状态更新：记录 `job_id, user_id, dataset_id, request_id`。
7. 失败时 `queue.fail` + 标记作业失败（具备重试逻辑）。

### 3.4 适配器（S0/S1）
- 输入：原始 Excel／CSV；输出：
  - 行级 (`FactRow[]` A–O)；
  - 汇总 (`AggRow[]` 6 列)；
  - warnings。
- 责任：字段映射、格式清洗、金额/数量规则、`row_key/row_hash` 生成。
- 需实现 3 个平台（wechat_video / xiaohongshu / douyin），与附件口径一致。

## 4. 数据模型
- `uploads` 表：记录 setiap 上传；包含 `content_hash`, `is_duplicate_file`, `dataset_id`, `mode`, `status`（pending/processing/completed/failed）。
- `datasets` 表：管理 `dataset_id → effective_upload_id/superseded_at`；支持 merge/replace。
- `upload_rows_index`：记录 `row_key/row_hash`，用于 merge 判定。
- Parquet（fact/agg）包含 `user_id`, `platform`, `year`, `month`, `upload_id`, `dataset_id`, `row_key`, `row_hash`。

## 5. API 与流程
- `/api/upload`: 保存元数据，生成上传目录或签名 URL。
- `/api/process`: 入队处理，返回 `jobId`；若 duplicate，直接返回已有数据。
- `/api/job/[jobId]`: 查询作业状态。
- `/api/preview`: 从有效视图读取 Parquet（可用 DuckDB HTTPFS 或 Arrow JS）；返回分页数据。
- `/api/export`: 读取 Parquet 生成 CSV/XLSX；测试时支持 `inline`；生产返回签名 URL。

## 6. 幂等与版本
- 文件级：SHA256 `content_hash` → 复用结果。
- Dataset：`dataset_id = hash(user_id, platform, year, month, file_type)`。
- Merge：按 `row_key` upsert；`row_hash` 判断数据是否变化。
- Replace：标记旧版本 `superseded_at`，新上传成为有效版本。
- History：Parquet 文件保留 `upload_id`，方便追踪；导出/预览仅使用 `effective` 数据。

## 7. 环境与部署
- dev-local：`STORAGE_DRIVER=local`（./uploads），`QUEUE_DRIVER=inmemory`，`DATABASE_DRIVER=duckdb`。
- staging-intl：`STORAGE_DRIVER=s3`，`QUEUE_DRIVER=upstash` 或 `sqs`，Worker Docker 部署 Fly/Render；Next.js 前端部署 Vercel。
- prod-cn：`STORAGE_DRIVER=ali-oss`，`QUEUE_DRIVER=mns`，Worker 在 SAE/ECS/ACK；API/前端在阿里云环境；开启 RLS/Tenant 控制；ICP 备案。
- 所有环境：环境变量配置见 PRD 附录（APP_BASE_URL, STORAGE_*, QUEUE_*, MAX_UPLOAD_MB, SIGN_URL_TTL_SEC）。

## 8. 测试与观测
- 单元测试：Storage/Queue driver、适配器、merge/replace、金样恒等式。
- E2E（Vitest）：见 `docs/E2E_Golden.md`（按补丁 2）。
- 日志：统一注入 `request_id, user_id, job_id, dataset_id`；失败记录堆栈。
- 监控：处理成功率、失败率、队列 backlog、P95 时延。

## 9. 迁移策略
- staging-intl 先实现完整链路；prod-cn 按计划创建资源 → 数据同步 → shadow → 双写 → 灰度 → DNS。
- Worker 镜像一次构建，跨环境运行（通过 ENV 切 driver）。

