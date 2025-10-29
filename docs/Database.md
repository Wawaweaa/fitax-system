# 数据库与存储设计

## 数据形态
- 原始：`raw/<platform>/<uploadId>/<filename>.xlsx`
- staging（可选）：`staging/<platform>/<uploadId>/...`
- 事实：`parquet/platform=<p>/year=<y>/month=<m>/fact.parquet`
- 汇总：`parquet/platform=<p>/year=<y>/month=<m>/agg.parquet`
- 导出：`exports/<platform>/<year>/<month>/<timestamp>.xlsx`
- dev-local：DuckDB 文件 `./data/app.db`

## DuckDB schema（dev-local）
```
CREATE TABLE IF NOT EXISTS stg_xhs_settlement (...);
CREATE TABLE IF NOT EXISTS stg_xhs_orders (...);
CREATE TABLE IF NOT EXISTS stg_dy_settlement (...);
CREATE TABLE IF NOT EXISTS stg_dy_orders (...);
CREATE TABLE IF NOT EXISTS stg_wv_settlement (...);

CREATE TABLE IF NOT EXISTS fact_settlement (
  platform TEXT,
  year INTEGER,
  month INTEGER,
  order_id TEXT,
  line_count INTEGER,
  line_no INTEGER,
  internal_sku TEXT,
  fin_code TEXT,
  qty_sold DOUBLE,
  recv_customer DOUBLE,
  recv_platform DOUBLE,
  extra_charge DOUBLE,
  fee_platform_comm DOUBLE,
  fee_affiliate DOUBLE,
  fee_other DOUBLE,
  net_received DOUBLE,
  spec_id TEXT -- dev-local 保留
);

CREATE TABLE IF NOT EXISTS agg_month_sku (
  platform TEXT,
  year INTEGER,
  month INTEGER,
  internal_sku TEXT,
  qty_sold DOUBLE,
  sum_recv_customer DOUBLE,
  sum_recv_platform DOUBLE,
  sum_extra_charge DOUBLE,
  sum_fee_platform_comm DOUBLE,
  sum_fee_affiliate DOUBLE,
  sum_fee_other DOUBLE,
  sum_net_received DOUBLE
);
```

## Parquet schema（云环境）
- `fact.parquet`: 字段与 `fact_settlement` 相同（含 spec_id）。
- `agg.parquet`: 字段与 `agg_month_sku` 相同。
- Metadata（可选 Postgres）：`jobs`, `files`, `metrics`, `tenants`。

## 索引与性能
- DuckDB：建立 `(platform, year, month)`、`(platform, internal_sku)` 索引。
- Parquet：按 `platform/year/month` 分区；可添加 `order_id` 排序 field。
- 队列：任务表可在 Postgres 建唯一索引 `jobId`。

## 脚本与工具
- `scripts/reset-db.ts`: 清理 `./data/app.db`（开发专用）。
- `scripts/sync-parquet.ts`: 同步 Parquet 至另一对象存储（S3 ↔ OSS）。
- `scripts/generate-agg.ts`: 由 fact Parquet 聚合生成 agg。
- `scripts/metrics.ts`: 读取 Postgres/Parquet 生成指标报表。

## 数据质量校验
- 主键唯一：`fact_settlement` (platform, order_id, spec_id, line_no)。
- 金额闭合：订单级 net_received 与源账单（可由 metadata 存储参考值）。
- 运费守恒：订单内 `SUM(extra_charge)` = 原正向运费。
- 迁移验证：S3 ↔ OSS 对象数量、字节数一致；Parquet 统计值对比。
