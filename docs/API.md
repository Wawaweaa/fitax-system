# API 规格（MVP/P0）

## 通用要求
- 所有请求需携带租户身份（`user_id`），可通过认证中间件注入。
- 返回结构：`{ request_id, message, data?, code? }`，便于日志追踪。
- 错误码：400 参数非法、401 未授权、403 禁止、404 找不到资源、409 冲突、422 校验失败、429 速率限制、500 内部错误。

## 1. POST /api/upload
- 功能：接收文件、计算 SHA256 `content_hash`，判断是否重复。
- 入参（multipart/form-data）：
  - `platform`: `xiaohongshu|douyin|wechat_video`
  - 文件字段：`settlement`（必）、`orders`（小红书/抖音必需）
  - 服务端从认证中获取 `user_id`
- 输出：
```json
{
  "request_id": "...",
  "data": {
    "uploadId": "ULP-...",
    "contentHash": "sha256...",
    "isDuplicateFile": false,
    "fileType": "settlement" | "orders"
  }
}
```
- 行为：
  - 计算 `content_hash`
  - 若 `(user_id, platform, file_type, content_hash)` 已存在 → `isDuplicateFile=true`、复用旧 `upload_id`
  - 否则保存原始文件至 `raw/` 并登记 `uploads`

## 2. POST /api/process
- 功能：触发数据处理；支持 merge/replace。
- 入参（JSON）：
```json
{
  "platform": "xiaohongshu",
  "year": 2025,
  "month": 8,
  "mode": "merge" | "replace",
  "uploads": {
    "settlementUploadId": "...",
    "ordersUploadId": "..."
  }
}
```
- 输出：`{ request_id, data: { jobId, status: "queued" } }`
- 行为：
  - 推导 `dataset_id = hash(user_id, platform, year, month, file_type)`
  - 若所有文件 `isDuplicateFile=true` 且已有有效数据 → 返回复用信息
  - 否则入队 `{ jobId, userId, platform, year, month, mode, datasetId, files }`
  - 记录作业状态 pending → processing → completed/failed

## 3. GET /api/job/[jobId]
- 功能：查询作业状态。
- 输出：
```json
{
  "request_id": "...",
  "data": {
    "jobId": "...",
    "status": "queued"|"processing"|"succeeded"|"failed",
    "datasetId": "...",
    "warnings": [...],
    "progress": 80,
    "error": "..."
  }
}
```
- 若失败，需包含 `error` 描述；成功需返回 `datasetId` 及统计信息。

## 4. GET /api/preview
- 功能：读取有效视图数据。
- Query 参数：`view=fact|agg`（默认 `fact`）、`platform`, `year`, `month`, `sku`（可选）、`page`, `pageSize`, `sort`。
- 行为：
  - 只读取 `fact_settlement_effective`/`agg_month_sku_effective`
  - 分页：默认 `page=1,pageSize=50`（最大 500）
  - 返回格式：`{ data: rows[], pagination: { page, pageSize, total }, summary: {...} }`

## 5. GET /api/export
- 功能：导出当前筛选数据。
- Query：与 preview 相同，另加 `format=csv|xlsx`（默认 `xlsx`）、`inline=0|1`。
- 行为：
  - 生产：生成 xlsx 至 `exports/`，返回签名下载 URL + 过期时间
  - 测试：若 `inline=1` 或 Header `x-test-inline=1` → 直接返回 `text/csv` 内容
  - 返回结构：
```json
{
  "request_id": "...",
  "data": {
    "downloadUrl": "https://...",
    "expiresAt": "..."
  }
}
```
  - CSV 格式：无千分位、两位小数、列顺序固定、首行表头。

## 6. 辅助 API（可选）
- `GET /api/uploads`：列出用户上传记录（含重复判断、状态）。
- `GET /api/datasets`：查询 dataset 当前有效版本。
- `POST /api/exports/retry`：重试导出（留待后续）。

## 7. Queue & Worker 协议
- 消息格式：
```json
{
  "jobId": "...",
  "userId": "...",
  "platform": "...",
  "year": 2025,
  "month": 8,
  "mode": "merge",
  "datasetId": "...",
  "files": {
    "settlement": "raw/user_id=.../platform=.../...",
    "orders": "raw/..."
  }
}
```
- Worker 完成后调用 `updateJobStatus(jobId, 'succeeded', ...)`。
- 失败时记录错误，支持重试；多次失败后标记 `failed` 并通知。

