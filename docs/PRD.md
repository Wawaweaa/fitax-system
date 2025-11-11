# 详细需求文档（PRD）

## 1. 用户故事与流程
- **上传**：运营选择平台 → 上传平台原始 `.xlsx`（仅值、≤50MB）→ 后端校验扩展名/MIME → 计算 SHA256 `content_hash` → 返回 `upload_id`、`content_hash`、`isDuplicateFile`。
- **处理**：触发 `/api/process`（支持 `mode=merge|replace`，默认 merge）→ 请求按 `user_id`、`platform`、`year`、`month`、`file_type` 推导 `dataset_id` → 若 `isDuplicateFile=true` 则直接复用既有结果；否则将作业入队 → Worker 下载文件 → S0 归一化 → S1 统一计算 A–O 15 列 → 根据 `mode` 执行 merge/replace → 写入 Parquet（fact/agg）→ 更新有效视图 → 记录作业状态。
- **预览**：前端在同一页面提供视图切换，默认显示行级（A–O 15 列），可切换到汇总（月×SKU 6 列）；支持平台、年、月、SKU 筛选；展示合计与一致性校验提示；URL 同步 `platform/year/month/sku/view`。
- **导出**：调用 `/api/export?view=fact|agg`（可选 `format=csv|xlsx`，测试时支持 `inline=1`）→ 后端从有效视图读取数据 → 输出 CSV（测试）或将 xlsx 写入 `exports/` 并返回签名 URL（生产）。
- **错误提示**：API 返回 JSON（含 `message`, `request_id`）；前端以中文弹窗提示。上传重复/缺文件/口径异常/金额不闭合等需有明确说明。

## 2. 数据契约
### 2.1 S0 标准字段
`order_id`, `spec_id`(或 sku/item_id), `settle_ts`, `item_qty`, `recv_customer`, `platform_coupon`, `platform_ship_subsidy`, `freight`, `platform_commission`, `affiliate_commission`, `merchant_code`, `source_file`, `ingested_at`, `user_id`。时区统一 Asia/Shanghai；金额 CNY，保留两位小数。

### 2.2 S1 统一字段（行级 A–O 15 列）
| 列 | 字段 | 含义 | 单位 | 备注 |
|----|------|------|------|------|
|A|year|结算年|INT|`EXTRACT(YEAR settle_ts)`|
|B|month|结算月|INT|`EXTRACT(MONTH settle_ts)`|
|C|order_id|订单号|TEXT|清洗后的主键|
|D|line_count|订单行数|INT|小红书/抖音暂 NULL；视频号可留空|
|E|line_no|订单序位|INT|小红书/抖音暂 NULL；其他平台可留空|
|F|internal_sku|平台商家编码|TEXT|XHS 需跨表补；抖音清理空白；视频号原生|
|G|fin_code|财务核算编码|TEXT|通常为 F 的前缀或派生|
|H|qty_sold|销售数量|DECIMAL(12,2)|三段式：>0→qty；-30~0→0；≤-30→-1|
|I|recv_customer|应收客户|DECIMAL(18,2)|含税|
|J|recv_platform|应收平台|DECIMAL(18,2)|补贴等|
|K|extra_charge|价外收费|DECIMAL(18,2)|运费≤0 取原值；>0 按订单均分|
|L|fee_platform_comm|平台佣金|DECIMAL(18,2)|正数扣减|
|M|fee_affiliate|分销佣金|DECIMAL(18,2)|正数扣减|
|N|fee_other|其它费用|DECIMAL(18,2)|默认 0，可扩展|
|O|net_received|应到账金额|DECIMAL(18,2)|I+J+K-L-M-N|

### 2.3 汇总视图（6 列）
`internal_sku, qty_sold_sum, income_total_sum, fee_platform_comm_sum, fee_other_sum, net_received_sum`
- `income_total_sum = recv_customer + recv_platform + extra_charge`
- `fee_other_sum = fee_affiliate + fee_other`
- 恒等校验：`income_total_sum - fee_platform_comm_sum - fee_other_sum == net_received_sum`
- 聚合维度：`user_id, platform, year, month, internal_sku`

### 2.4 行指纹
- `row_key`：concat(`platform`, `order_id`, `item_id_or_sku`, `line_no/derived`)；settlement 可包含 `settle_batch`。
- `row_hash = SHA256(canonical_json(pick(key+amount+qty cols)))`。

## 3. 平台适配策略
- **小红书**：结算 + 订单两表；`row_key` 需跨表补 `internal_sku`；运费正向均分；`line_count/line_no=NULL`。
- **抖音**：结算第 2 行注释过滤；A/B/F 列去不可见空白；`row_key` 使用清洗后字段；`line_count/line_no=NULL`。
- **视频号**：可单表；直接提供 `internal_sku`；行序列可派生或置空。
- 所有平台：统一金额精度，两位小数；merge 时按 `row_key/row_hash` upsert，replace 时整月替换。

## 4. API 规格（P0 必做）
- `POST /api/upload`
  - form-data：平台所需文件（settlement/orders），`user_id` 由鉴权注入。
  - 处理：计算 `content_hash` → 查询 `(user_id, platform, file_type, content_hash)` 是否存在 → 返回 `{ uploadId, contentHash, isDuplicateFile }`。
- `POST /api/process`
  - body：`{ platform, year, month, mode, uploads: {...}, userId? }`
  - 行为：生成 `dataset_id`，若全部文件 duplicate → 返回复用结果；否则入队处理；响应 `{ jobId }`。
- `GET /api/job/:jobId`
  - 返回 `{ status: queued|processing|succeeded|failed, datasetId, requestId, error?, warnings? }`。
- `GET /api/preview?view=fact|agg&platform=&year=&month=&sku=`
  - 读取有效视图（latest version）；支持分页/排序（后续迭代）；返回行级或汇总数据。
- `GET /api/export?view=fact|agg&platform=&year=&month=&sku=&format=csv|xlsx&inline=0`
  - 生产：生成 xlsx 至 `exports/`，返回签名 URL；测试：若 header `x-test-inline=1` 或 `inline=1` 则直接返回 CSV 文本。
- 错误格式：`{ request_id, message, code, details? }`。

## 5. 前端视图
- 上传/处理页：平台选择、文件上传、SHA256 去重提示、处理模式（merge/replace）选择、状态/作业进度展示。
- 预览区：行级/汇总视图切换（ToggleGroup）；过滤；合计卡片（含一致性提示）。
- 导出按钮：根据视图更新文案与 `view` 参数；支持 CSV（开发）与 XLSX（生产）。
- URL 同步：`platform/year/month/sku/view`；刷新或分享保持状态。
- 错误/空态/骨架：统一组件（LoadingSkeleton、ErrorCard、EmptyState）。

## 6. 校验与守恒
- 主键唯一：有效视图 `row_key` 不重复；历史表保留 superseded。
- 金额守恒：订单级 `net_received` 与来源对齐；汇总恒等式逐行成立。
- 运费分摊守恒：订单内 `SUM(extra_charge)` = 原正向运费。
- 幂等：重复文件直接复用；merge upsert；replace supersede。
- 租户隔离：所有查询/导出需带 `user_id`，不可跨租户访问。

## 7. 非目标
账号 UI、租户管理界面、append 模式、自定义口径、BI 仪表、批量回滚、公式编辑、国际化等留待后续。

## 8. 附件引用
- 《跨平台订单结算数据统一规范（Data Contract）v0.1》
- 《平台适配层字段定义矩阵 v0.1》
- 《视频号字段定义与映射 v0.1》
- 《Phase 1 MVP 骨架（Next.js + DuckDB）》
- 《部署蓝图（staging-intl / prod-cn）》
- 《E2E 金样测试规范》

## 9. 租户隔离与幂等处理
- `user_id` 由鉴权层传入，所有对象存储、队列消息、日志、作业状态均需持有 `user_id`。
- 对象存储路径：
  - `raw/user_id={uid}/platform={platform}/file_type={...}/uploaded_at={ISO8601}/original.xlsx`
  - `parquet/user_id={uid}/platform=.../year=.../month=.../upload_id=.../fact.parquet`
  - `exports/user_id={uid}/platform=.../year=.../month=.../timestamp=.../result.xlsx`
- 幂等键：`(user_id, platform, file_type, content_hash)`。
- `dataset_id = SHA256(user_id, platform, year, month, file_type)`。
- Merge：按 `row_key/row_hash` upsert；Replace：整月 supersede；Append 留待 P1。

## 10. Parquet 真相与有效视图
- Worker 生成
  - `fact/*.parquet`（A–O）
  - `agg/*.parquet`（汇总 6 列）
- 有效视图：
  - `fact_settlement_effective`（latest merge/replace 结果，过滤 superseded）
  - `agg_month_sku_effective`
- 数据历史：保留 `fact_settlement_history` / `agg_history`（标记 `superseded_at`）。

## 11. 部署与环境
- **dev-local**：Next.js + DuckDB 本地；Storage/Queue 使用 `local`/`inmemory`。
- **staging-intl**：Vercel/Next → S3 存储 → Queue (Upstash/SQS) → Worker (Fly/Render/DO)；导出用签名 URL；金样 E2E 必须通过。
- **prod-cn**：阿里云 OSS/MNS/SAE/ApsaraDB；遵循 ICP、证书、同地域要求。
- 环境变量最小集：
  - `APP_BASE_URL`, `STORAGE_DRIVER`, `S3_REGION/Bucket/AccessKey/Secret`, `QUEUE_DRIVER`, `UPSTASH_REDIS_URL` 或 `SQS_QUEUE_URL`, `MAX_UPLOAD_MB`, `ALLOWED_EXT`, `SIGN_URL_TTL_SEC`。

## 12. 迁移与灰度
- 立即实现 Storage/Queue 双 driver、Worker容器化、Parquet 为中心、签名上传。
- 坚持 staging-intl → prod-cn 迁移步骤：资源创建 → 数据同步 → shadow → 双写 → 灰度（10→50→100%）→ DNS 切换 → 回滚预案。

## 13. 验收指标（DoD）
1. 上传→处理（merge/replace）→写 Parquet→有效视图→预览/导出整个链路跑通。
2. 金样对比：`expected_fact.csv` / `expected_agg.csv` 与导出结果字节级一致；汇总恒等式逐行成立。
3. TypeScript 严格模式、构建通过；核心接口单测 + 至少 1 个金样 E2E 通过。
4. staging-intl 部署可用，支持真实样本。
5. 日志包含 `request_id/user_id/job_id/dataset_id`；失败可定位并至少重试一次成功。
