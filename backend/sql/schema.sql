-- Fitax 数据库架构
-- 用于本地开发的 DuckDB 架构

-- 创建 staging 表 (平台 × 阶段)
-- xiaohongshu
CREATE TABLE IF NOT EXISTS staging_xiaohongshu_settlement (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR,
  raw_line INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 原始字段（根据平台Excel格式）
  order_id VARCHAR,
  product_id VARCHAR,
  internal_sku VARCHAR,
  product_title VARCHAR,
  order_time TIMESTAMP,
  quantity INTEGER,
  price DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2),
  payment_amount DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  commission_amount DECIMAL(10, 2),
  platform_fee DECIMAL(10, 2),
  delivery_fee DECIMAL(10, 2),
  other_fee DECIMAL(10, 2),
  refund_amount DECIMAL(10, 2),
  settlement_amount DECIMAL(10, 2),
  settlement_time TIMESTAMP,
  status VARCHAR,
  remarks VARCHAR
);

CREATE TABLE IF NOT EXISTS staging_xiaohongshu_orders (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR,
  raw_line INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 原始字段（根据平台Excel格式）
  order_id VARCHAR,
  product_id VARCHAR,
  internal_sku VARCHAR,
  product_title VARCHAR,
  order_time TIMESTAMP,
  quantity INTEGER,
  price DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  payment_amount DECIMAL(10, 2),
  status VARCHAR,
  delivery_status VARCHAR,
  address_province VARCHAR,
  address_city VARCHAR,
  buyer_id VARCHAR,
  buyer_nickname VARCHAR,
  remarks VARCHAR
);

-- douyin
CREATE TABLE IF NOT EXISTS staging_douyin_settlement (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR,
  raw_line INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 原始字段（根据平台Excel格式）
  settlement_id VARCHAR,
  order_id VARCHAR,
  product_id VARCHAR,
  internal_sku VARCHAR,
  product_title VARCHAR,
  order_time TIMESTAMP,
  quantity INTEGER,
  price DECIMAL(10, 2),
  payment_amount DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  commission_amount DECIMAL(10, 2),
  platform_service_fee DECIMAL(10, 2),
  promotion_fee DECIMAL(10, 2),
  other_deduction DECIMAL(10, 2),
  settlement_amount DECIMAL(10, 2),
  settlement_time TIMESTAMP,
  settlement_cycle VARCHAR,
  payment_method VARCHAR,
  status VARCHAR
);

CREATE TABLE IF NOT EXISTS staging_douyin_orders (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR,
  raw_line INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 原始字段（根据平台Excel格式）
  order_id VARCHAR,
  sub_order_id VARCHAR,
  product_id VARCHAR,
  internal_sku VARCHAR,
  product_title VARCHAR,
  order_time TIMESTAMP,
  quantity INTEGER,
  price DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  discount_amount DECIMAL(10, 2),
  payment_amount DECIMAL(10, 2),
  status VARCHAR,
  delivery_status VARCHAR,
  buyer_id VARCHAR,
  buyer_nickname VARCHAR,
  address_detail VARCHAR,
  contact_name VARCHAR,
  contact_phone VARCHAR,
  remarks VARCHAR
);

-- wechat_video
CREATE TABLE IF NOT EXISTS staging_wechat_video_orders (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR,
  raw_line INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 原始字段（根据平台Excel格式）
  order_id VARCHAR,
  line_no INTEGER,
  line_count INTEGER,
  transaction_id VARCHAR,
  product_id VARCHAR,
  internal_sku VARCHAR,
  product_title VARCHAR,
  order_time TIMESTAMP,
  quantity INTEGER,
  price DECIMAL(10, 2),
  payment_amount DECIMAL(10, 2),
  commission_rate DECIMAL(5, 2),
  commission_amount DECIMAL(10, 2),
  platform_fee DECIMAL(10, 2),
  promotion_fee DECIMAL(10, 2),
  delivery_fee DECIMAL(10, 2),
  other_fee DECIMAL(10, 2),
  settlement_amount DECIMAL(10, 2),
  settlement_time TIMESTAMP,
  status VARCHAR,
  buyer_id VARCHAR,
  buyer_nickname VARCHAR,
  address_province VARCHAR,
  address_city VARCHAR,
  remarks VARCHAR
);

-- 统一的事实表（15字段A-O）
CREATE TABLE IF NOT EXISTS fact_settlement (
  id INTEGER PRIMARY KEY,
  platform VARCHAR NOT NULL,
  upload_id VARCHAR NOT NULL,
  job_id VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 标准字段 A-O
  year INTEGER NOT NULL, -- A
  month INTEGER NOT NULL, -- B
  order_id VARCHAR NOT NULL, -- C
  line_count INTEGER, -- D
  line_no INTEGER, -- E
  internal_sku VARCHAR NOT NULL, -- F
  fin_code VARCHAR, -- G
  qty_sold INTEGER NOT NULL, -- H
  recv_customer DECIMAL(10, 2) NOT NULL, -- I
  recv_platform DECIMAL(10, 2) NOT NULL, -- J
  extra_charge DECIMAL(10, 2) NOT NULL, -- K
  fee_platform_comm DECIMAL(10, 2) NOT NULL, -- L
  fee_affiliate DECIMAL(10, 2) NOT NULL, -- M
  fee_other DECIMAL(10, 2) NOT NULL, -- N
  net_received DECIMAL(10, 2) NOT NULL, -- O
  -- 元数据
  source_file VARCHAR,
  source_line INTEGER,
  -- 索引
  UNIQUE (platform, year, month, order_id, internal_sku, line_no)
);

-- 聚合表（月×SKU）
CREATE TABLE IF NOT EXISTS agg_month_sku (
  id INTEGER PRIMARY KEY,
  platform VARCHAR NOT NULL,
  upload_id VARCHAR NOT NULL,
  job_id VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- 聚合维度
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  internal_sku VARCHAR NOT NULL,
  -- 聚合值
  qty_sold_sum INTEGER NOT NULL,
  income_total_sum DECIMAL(12, 2) NOT NULL, -- I + J + K
  fee_platform_comm_sum DECIMAL(12, 2) NOT NULL, -- L
  fee_other_sum DECIMAL(12, 2) NOT NULL, -- M + N
  net_received_sum DECIMAL(12, 2) NOT NULL, -- O
  -- 元数据
  record_count INTEGER NOT NULL,
  -- 索引
  UNIQUE (platform, year, month, internal_sku)
);

-- 作业日志表
CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY,
  job_id VARCHAR NOT NULL UNIQUE,
  platform VARCHAR NOT NULL,
  upload_id VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  status VARCHAR NOT NULL, -- pending, running, completed, failed
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  error_message VARCHAR,
  result_details VARCHAR, -- JSON
  -- 索引
  INDEX idx_job_status (status),
  INDEX idx_platform_date (platform, year, month)
);

-- 文件元数据表
CREATE TABLE IF NOT EXISTS file_metadata (
  id INTEGER PRIMARY KEY,
  upload_id VARCHAR NOT NULL,
  platform VARCHAR NOT NULL,
  file_key VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash VARCHAR,
  content_type VARCHAR,
  uploaded_at TIMESTAMP NOT NULL,
  processing_status VARCHAR, -- pending, processed, failed
  -- 索引
  UNIQUE (upload_id, file_key)
);

-- 导出记录表
CREATE TABLE IF NOT EXISTS export_logs (
  id INTEGER PRIMARY KEY,
  export_id VARCHAR NOT NULL UNIQUE,
  platform VARCHAR NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sku VARCHAR,
  view_type VARCHAR NOT NULL, -- fact, agg
  created_at TIMESTAMP NOT NULL,
  file_path VARCHAR,
  file_size INTEGER,
  status VARCHAR NOT NULL, -- pending, completed, failed
  error_message VARCHAR,
  -- 索引
  INDEX idx_platform_date (platform, year, month)
);