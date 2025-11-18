# 验收清单（MVP/P0）

## 功能 & 数据链路
- 上传→处理（merge/replace）→Parquet 写入→有效视图→预览/导出全链路跑通。
- 三平台（小红书/抖音/视频号）处理成功，行级 A–O 与汇总 6 列符合口径。
- 幂等上传：重复文件不触发处理；`isDuplicateFile` 标记正确；merge/replace 行为符合预期。
- 租户隔离：API 与导出均基于 `user_id`；无法跨租户访问。

## 数据质量
- 行级：主键唯一（`row_key`），金额守恒、运费守恒、`row_hash` 校验。
- 汇总：`income_total_sum - fee_platform_comm_sum - fee_other_sum == net_received_sum` 对每行成立。
- 有效视图：`fact_settlement_effective`/`agg_month_sku_effective` 仅包含最新版本；历史表保留 superseded。

## API 验收
- `/api/upload` 返回 `uploadId/contentHash/isDuplicateFile`，重复命中即复用。
- `/api/process` 支持 `mode=merge|replace`，返回 `jobId`。
- `/api/job/:jobId` 状态更新准确（queued→processing→succeeded/failed）。
- `/api/preview` 支持行级/汇总视图，按筛选返回有效数据。
- `/api/export` 支持 CSV/XLSX；测试模式（inline）返回 CSV；生产模式返回签名 URL。
- 错误响应包含可读 `message` 与 `request_id`。

## 前端验收
- 上传/处理页：显示重复提示、处理模式、作业进度；错误提示清晰。
- 预览区：视图切换、过滤、合计卡片、一致性提示；导出按钮文案随视图切换。
- 数值格式：两位小数，右对齐，负数 `-` 前缀，无千分位。
- URL 同步 `platform/year/month/sku/view`；刷新/分享保持状态。

## Worker & 后端
- Storage/Queue driver：local/s3、inmemory/queue 至少一种真实实现；单元测试覆盖。
- Worker 处理流程：下载→S0/S1→merge/replace→写 Parquet→更新有效视图→日志。
- 日志包含 `request_id/user_id/job_id/dataset_id`；失败可重试一次成功。
- 导出签名 URL 有效，过期后不可访问。

## 金样 E2E
- `expected_fact.csv` & `expected_agg.csv` 准备完毕；E2E 测试（Vitest）导出实际 CSV。
- 字节级比较：`actual_fact.csv` 与 `expected_fact.csv` 完全一致；`actual_agg.csv` 同理。
- 恒等式校验通过；行序列符合规范（fact: internal_sku, order_id, line_no；agg: internal_sku）。

## 部署
- staging-intl：Vercel (前端) + S3 + Queue (Upstash/SQS) + Worker（Fly/Render/DO）；样本流程跑通；金样 diff=0。
- prod-cn：资源准备、shadow 验证、双写/灰度、DNS 切换、回滚预案（M1/M2）。
- README/手册：包含环境变量、启动、部署、E2E 运行说明。

