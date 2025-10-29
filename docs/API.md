# API 规格

## 核心端点
### POST /api/upload
- form-data：`platform` + 所需文件字段（如 `settlement`, `orders`）。
- dev-local：保存到 `uploads/`；云环境：仅返回预签名 URL（`/api/upload-signed`）。
- 返回：`{ uploadId, platform, files: [...] }`
- 错误码：400/413/415/422。

### GET /api/upload-signed
- 入参：`{ platform, fileKey, contentType }`
- 返回：`{ uploadUrl, expiresIn }`
- 存储通过 `Storage` driver 决定 S3 或 OSS。

### POST /api/process
- 入参：`{ platform, uploadId, year, month }`
- dev-local：同步执行 S0/S1。
- 云环境：写入队列 → Worker 处理。
- 返回：`{ jobId, factRows?, aggRows?, warnings[] }`

### GET /api/process-status
- 入参：`jobId`
- 返回：`{ status: pending|running|failed|completed, detail }`

### GET /api/preview
- Query：`platform`, `year`, `month`, `sku`, `view` (`fact|agg`), `page`, `pageSize`, `sort`。
- dev-local：查询 DuckDB 表。
- 云环境：从 Parquet (DuckDB httpfs) 或 Metadata DB 读取。
- 返回：行级 A–O 或汇总列。

### GET /api/export
- Query 同 preview + `view`。
- dev-local：即时生成 xlsx。
- 云环境：Worker 生成后上传 `exports/`，返回签名下载链接。

## 内部/运维 API
- `POST /api/worker/trigger`: 手动触发 Worker（可选）。
- `GET /api/metrics`: 暴露 Prometheus 指标（处理成功率、耗时、队列长度等）。

## 签名/直传流程
1. 浏览器调用 `/api/upload-signed`（传 `fileKey`, `contentType`）。
2. 服务端使用 `Storage` driver 生成预签名 URL。
3. 浏览器直传至对象存储。
4. 成功后调用 `/api/process` 排队执行。

## 队列消息结构
```json
{
  "jobId": "...",
  "platform": "xiaohongshu",
  "uploadId": "...",
  "year": 2025,
  "month": 8,
  "files": ["raw/...xlsx"],
  "requestedBy": "userId",
  "requestedAt": "ISO8601"
}
```

## 错误码规范
- 400：参数缺失/不合法。
- 401：未授权（未来迭代）。
- 403：禁止访问。
- 404：资源不存在（uploadId/jobId）。
- 413：文件过大。
- 415：文件类型不支持。
- 422：业务校验失败（主键冲突、金额闭合失败等）。
- 429：请求过多（速率限制）。
- 500：服务器错误。

## 日志与追踪
- 每个 job 记录 `jobId`, `platform`, `uploadId`, `status`, `duration`, `errors`。
- 失败任务写入错误详情（含样本行号、字段信息），供重试。
- 使用 Sentry/阿里云 SLS 投递结构化日志。
