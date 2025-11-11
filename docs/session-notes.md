# Session Notes — 微信视频号链路收尾

- 时间（UTC）：2025-11-09 01:42:27Z
- 阶段：微信视频号链路跑通的收尾阶段（导出准确性与一致性）

## 背景与问题
- 年/月在导出缺失：已通过固定列头与数组写入修复（XLSX）。
- “平台商品编码/商品编码”列值对调：已纠正为 平台商品编码=internal_sku，商品编码=fin_code。
- 导出行数少、line_count/line_no 为 0：导出仅取 lastJob，预览取所有 jobIds，导致范围不一致。

## 已完成改动（保持业务行为不变）
- 行级 XLSX 导出模块化：
  - 统一表头 `FACT_ROW_HEADER`（15 列，固定顺序）。
  - 纯函数 `buildFactAoA(year, month, rows)` 生成 AoA，含长度自检（15 列）。
  - 行级导出仅生成单一工作表 `fact_rows`，保留轻量日志与 sanity 日志。
- 汇总 XLSX 导出收尾：固定表头 + 数组写入，单一工作表 `agg_rows`；中文列名“商品编码”。
- 与预览同源：导出改为使用 `previewFactQuery(..., dataset?.metadata?.jobIds, ...)`，与预览一致。

## 验证结果
- sanity 日志显示导出 rows 数量与预览一致；line_count/line_no 正常。
- 导出的 XLSX 中仅 1 个 sheet（行级：`fact_rows`；汇总：`agg_rows`）；列顺序与表头一致。

## 文件与关键位置
- `frontend/app/api/export/route.ts`
  - 表头与类型：`FACT_ROW_HEADER`, `FactRowForExport`
  - AoA 纯函数：`buildFactAoA(...)`
  - 与预览同源的 fact 查询：`previewFactQuery(... dataset?.metadata?.jobIds ...)`
  - 汇总导出：`agg_rows`（固定表头 + 数组写入）
- `frontend/app/api/preview/route.ts`
  - 预览 fact 查询：`previewFactQuery(validatedPlatform, year, month, dataset?.metadata?.jobIds, userId, sku, pageSize, offset)`

## 后续建议（非必须）
- CSV 导出可复用同一表头/映射函数，确保两种格式一致。
- 可选参数控制导出 job 范围（lastJob vs all jobs），默认与预览一致降低混淆。
- 为金额/数量列添加 XLSX 数字格式与右对齐（可选）。

---

# Update — 微信视频号链路收尾（阶段进展）

- 时间（UTC）：2025-11-09 03:20:00Z
- 范围：清空能力、导出/预览一致性、wechat_video 业务链路排查

## 本阶段完成
- 导出（fact/agg）的工程化收尾：
  - fact：固定表头 + 数组写入，单一 sheet `fact_rows`，日志收紧。
  - agg：固定表头 + 数组写入，单一 sheet `agg_rows`，日志收紧；“商品编码”命名与行级一致。
  - 列映射修正：平台商品编码=internal_sku，商品编码=fin_code。
  - 导出 rows 与预览保持同源（previewFactQuery + dataset.metadata.jobIds）。
- 预览/导出诊断增强：
  - 预览：打印 dataset 概况 + fact rows 概况（rowsLength/first5）。
  - 导出：打印 dataset 概况与 rows 概况。
- 清空能力（正式 API）：
  - 新增 POST `/api/clear-settlement`，调用 clearSettlementForPeriod(userId, platform, year, month)。
  - 清空逻辑（方案A）：supersede 数据集 + 删除 parquet（fact/agg 有效目录）+ 清理 dataset_rows 索引。
  - 关键 bug 修复：
    - 引入 getDatasetsFresh()，关键查询不再被进程内缓存污染。
    - supersede() 标记同 id 所有记录为 superseded，避免残留 active。
    - createDataset() 再次处理时可“重新激活”同 id 数据集，并去重多条重复记录。

## 当前验证状态
- 清空后 preview：datasetExists=false，pagination.total=0，data=[]。
- 再处理：/api/process 不再 duplicate；预览/导出与 worker 输出保持一致（按最新样本分别验证）。
- wechat_video（2025/7）业务链路：
  - worker 端新增 wechat-debug 日志：
    - 原始行数（去表头后）与样例行；
    - fact 生成阶段样例；
    - final factRows length。
  - 近期观测：worker 输出 27 行；导出 xlsx 27 行；
    - 但 preview 在个别场景出现 total=27 而 data=[] 或 data=26 的现象，已在 preview 端加 rows 概况日志定位。

## 下一步（收敛执行）
- 仅聚焦 wechat_video 业务处理链路：确保“读取 → 规则计算 → fact 行 → parquet”全程不删行、行号正确；
  - 以 2025/7 样本复现：第一次处理与清空后再次处理结果一致（27 行、行号正确、金额一致）。
- 将清空 API 对接前端右上角“清空”按钮（仅清当前租户 + 当前筛选平台/年月）。

---

# Update — 阶段性排查与稳定性增强（队列/worker 与前端交互）

- 时间（UTC）：2025-11-11 06:22:54Z
- 范围：/api/clear-settlement 接口落地、前端清空按钮可用性、worker/queue 诊断日志、datasets 一致性检查、wechat_video 27/26 不稳定复现与界面联动。

## 关键进展
- 清空 API（正式）上线：
  - 新增 POST `/api/clear-settlement`，复用 `clearSettlementForPeriod`；
  - 清空策略：`supersede` + 删除 parquet（fact/agg 有效目录）+ 清理 `dataset_rows.json` 索引；
  - 前后打印周期内的 datasets 列表：`[clear-api-debug] before/after datasets`。
- 前端“清空数据”接入：
  - `page.tsx` 增加 `handleClear`，按钮 disabled 仅依赖 `clearing`，不再受 `showPreview` 限制；
  - 清空成功后重置错误态/表格数据并触发 `loadData()`，UI 回到空态。
- datasets 一致性：
  - `getDatasetsFresh()` 用于关键查询，`getEffectiveDataset` 打印同周期所有记录 `([datasets-debug])` 并仅返回 `active`；
  - `supersede()` 标记同 id 的所有记录，`createDataset()` 去重并可重新激活；
  - 清空后 `preview`：`datasetExists=false/total=0` 符合预期。
- 预览/导出诊断增强：
  - `preview` 打印 `rowsLength/first5` 与 `final`（datasetId/jobIdsFromMetadata/factCountFromMetadata）；
  - `export` 打印 `rowsCountFromDuckdb` 与 `factCountFromMetadata`；
  - wechat 适配器打印 `final stats`（含 `zeroLineCount/nonZeroLineCount`）。
- 队列/worker 归因增强：
  - `FileQueue` 入队/预留：`[queue-debug] enqueue/reserve { messageId, jobId, workerPid }`；
  - worker 实例：`[worker-instance] started { workerInstanceId, pid }`；处理作业时：`[worker-debug] start { workerInstanceId, jobId, queueMessageId }`；完成：`[worker-debug] done {...}`；
  - `process` 路由仅入队并返回，打印 `[process] enqueue job {...}`，无同步处理路径。

## 现象复盘（2025/7 wechat_video）
- Run A（正常）：
  - 清空 → process/job 入队 → worker 消费（27 行，行号正确）→ preview/export 一致（27 行）。
- Run B（异常）：
  - 清空返回 ok；/api/process duplicated（worker 未触发）→ preview/export 却读取到旧 job（26 行、行号为 0）；
  - 日志显示无对应 `[worker-debug start/done]`，说明存在“绕过 worker”的处理路径或旧进程消费队列。

## 风险点与定位计划
- 风险：同周期存在多条 dataset 记录（含旧 id）或某路径未使用 fresh 读取导致回滚；
- 风险：非当前 worker 实例在处理队列（或同步路径直接写 parquet/metadata）。
- 定位：收集 `queue-debug/worker-debug/datasets-debug/preview-debug/export-debug` 全量日志，对比“对一次/错一次”的 jobId/messageId/workerPid 是否一致。

## 下一步（仅日志/定位，不改业务）
- 继续复现“错一次”的完整日志：
  - `queue-debug enqueue/reserve`、`worker-instance/start/done`、`datasets-debug getEffectiveDataset related`、`preview-debug final`、`export-debug fact`；
  - 确认是否有其他进程消费队列或同步处理路径。
- 一旦确认元凶：
  - 若是旧 worker：停止并清理残留进程/队列；
  - 若是同步处理路径：移除该入口（统一通过队列 + worker）。
