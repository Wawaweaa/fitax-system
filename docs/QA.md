# 验收清单

## 功能与数据
- 行级视图展示 A–O 15 列，汇总视图展示 6 列；合计行正确。
- 小红书/抖音 D/E 为空；视频号 D/E 有值并符合公式。
- `/api/process` → 导出 fact/agg CSV，与 `expected/` 金样 diff=0。
- 主键唯一、金额闭合、运费守恒；缺失字段记录 warning。

## API
- `POST /api/upload` 校验扩展名/MIME/大小；错误码准确。
- `GET /api/upload-signed` 返回预签名 URL。
- `POST /api/process` 幂等；失败返回 422 并附错误详情。
- `GET /api/preview` 根据 `view` 返回正确字段；分页/排序准确。
- `GET /api/export` 生成文件或签名链接；文件名符合规范。

## 前端
- 视图切换保持筛选条件；URL 同步 `platform/year/month/sku/view`。
- 数值列千分位，负数表达正确；tooltip 显示原始值。
- 错误、空态、骨架状态展示正确。

## Worker & 队列
- Storage/Queue driver 支持 S3/AliOSS、Redis/SQS/MNS；单元测试覆盖。
- Worker 可从队列取任务，处理成功率 ≥99%，失败可重试。
- 任务日志包含 jobId、耗时、错误详情；Sentry/SLS 收集。

## Parquet & 导出
- Parquet 存储在 `parquet/platform=.../year=.../month=...`；字段 schema 与 PRD 一致。
- 导出文件在 `exports/`，签名链接可下载，成功率 ≥99%。
- 防 CSV 注入：导出内容无公式执行风险。

## 部署 / 运维
- `dev-local`：`npm run dev` + DuckDB。
- `staging-intl`：Vercel 前端 + S3 Storage + Queue + Worker；E2E 用金样通过。
- `prod-cn`：OSS + MNS + SAE/ECS Worker + CDN/OSS 前端；ICP/证书完成。
- Storage/Queue driver 可通过 ENV 切换；配置文件无硬编码密钥。
- 监控面板：处理成功率、平均时长、失败率、导出成功率、P95 排队时延。

## 迁移验收（staging-intl → prod-cn）
- 上传（小/中/全月样本）成功率 ≥99.5%，同地域首包 <2s。
- 金样 diff=0（行级 & 汇总）。
- 导出签名下载成功率 ≥99%，有效期/权限正确。
- 双写期间笔数与金额守恒；监控指标无异常。
- DNS 切换成功；回滚预案演练通过。

## 安全与合规
- 文件白名单 `.xlsx`，MAX_UPLOAD_MB 控制；速率限制生效。
- 签名/STS 权限最小化；日志不含敏感数据。
- prod-cn：ICP、域名、证书配置验证通过。

