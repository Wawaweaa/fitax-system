// 平台类型
export type Platform = "xiaohongshu" | "douyin" | "wechat_video";

// 视图类型
export type ViewType = "fact" | "agg";

// 处理模式
export type ProcessMode = "merge" | "replace";

/**
 * 事实表行（行级数据 - 15列）
 */
export interface FactRow {
  // 标准字段 (A-O 15列)
  year: number;                  // A: 结算年
  month: number;                 // B: 结算月
  order_id: string;              // C: 订单号
  line_count: number | null;     // D: 订单行数 (小红书/抖音可能为null)
  line_no: number | null;        // E: 订单序位 (小红书/抖音可能为null)
  internal_sku: string;          // F: 商家编码
  fin_code: string;              // G: 财务核算编码
  qty_sold: number;              // H: 销售数量
  recv_customer: number;         // I: 应收客户
  recv_platform: number;         // J: 应收平台
  extra_charge: number;          // K: 价外收费
  fee_platform_comm: number;     // L: 平台佣金
  fee_affiliate: number;         // M: 分销佣金
  fee_other: number;             // N: 其它费用
  net_received: number;          // O: 应到账金额

  // 元数据字段（仅用于处理和存储）
  platform?: string;             // 平台编码
  upload_id?: string;            // 上传ID
  job_id?: string;               // 作业ID
  source_file?: string;          // 源文件
  source_line?: number;          // 源文件行号
  row_key?: string;              // 行键
  row_hash?: string;             // 行哈希
  record_count?: number;         // 记录数
  amount_adjustment_warning?: string;  // 金额调整 warning 信息
}

/**
 * 聚合表行（汇总数据 - 6列）
 * 说明：文案统一为“明细数据/汇总数据”，其中本类型对应“汇总数据”。
 */
export interface AggRow {
  platform?: string;             // 平台编码
  upload_id?: string;            // 上传ID
  job_id?: string;               // 作业ID
  year?: number;                 // 结算年
  month?: number;                // 结算月
  internal_sku: string;          // 商家编码
  qty_sold_sum: number;          // 销售数量 = SUM(H: qty_sold)
  income_total_sum: number;      // 收入合计 = SUM(I + J + K)
  fee_platform_comm_sum: number; // 扣：平台佣金 = SUM(L)
  fee_other_sum: number;         // 扣：其他费用 = SUM(M + N)
  net_received_sum: number;      // 应到账金额 = SUM(O)
  record_count?: number;         // 记录数
}

/**
 * 前端上传文件接口
 */
export type UploadFileType = "settlement" | "orders";

export interface UploadedFile {
  key: UploadFileType;
  file: File;
  uploadId?: string;
  contentHash?: string;
  isDuplicateFile?: boolean;
}

/**
 * 上传响应接口
 */
export interface UploadResult {
  uploadId: string;
  contentHash: string;
  isDuplicateFile: boolean;
  fileType: UploadFileType;
  originalFilename?: string;
}

export interface UploadResponse {
  files: UploadResult[];
}

export type UploadResultsMap = Partial<Record<UploadFileType, UploadResult>>;
export type UploadFilesMap = Partial<Record<UploadFileType, UploadedFile>>;

/**
 * 文件元数据接口（从上传记录中提取）
 */
export interface FileMetadata {
  id: string;              // 上传ID (ULP-xxx)
  objectKey: string;
  contentHash: string;
  fileType: string;
  originalFilename: string;
  size: number;
}

/**
 * 处理请求接口
 */
export interface ProcessRequest {
  platform: Platform;
  year: number;
  month: number;
  mode?: ProcessMode;
  uploads: {
    settlementUploadId: string;
    ordersUploadId?: string;
  };
  // 新增：文件元数据（优先使用，避免Worker重复查询）
  fileMetadata?: {
    settlement: FileMetadata;
    orders?: FileMetadata;
  };
  // 保留：文件对象键（兼容性）
  fileObjects?: Record<string, string>;
  // 保留：数据集ID
  datasetId?: string;
  // 保留：作业ID
  jobId?: string;
  // 保留：请求ID
  requestId?: string;
}

/**
 * 处理响应接口
 */
export interface ProcessResponse {
  jobId: string;
  status: string;
  message: string;
}

/**
 * 作业状态接口
 */
export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "succeeded" | "completed" | "failed";
  message: string;
  progress: number;
  datasetId?: string;
  platform: string;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  factCount?: number;
  aggCount?: number;
  warnings?: string[];
  error?: string;
}

/**
 * 预览请求接口
 */
export interface PreviewRequest {
  platform: Platform;
  view: ViewType;
  year: number;
  month: number;
  sku?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 预览响应接口
 */
export interface PreviewResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  summary?: {
    count: number;
    warnings?: string[];
    [key: string]: any;
  };
}

/**
 * 导出请求接口
 */
export interface ExportRequest {
  platform: Platform;
  view: ViewType;
  year: number;
  month: number;
  sku?: string;
  format?: "csv" | "xlsx";
  inline?: boolean;
}

/**
 * 导出响应接口
 */
export interface ExportResponse {
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
}

/**
 * 数据行接口（前端展示用）
 */
export interface DataRow {
  internal_sku: string;
  qty_sold: number;
  sum_recv_customer: number;
  sum_recv_platform: number;
  sum_extra_charge: number;
  sum_fee_platform_comm: number;
  sum_fee_affiliate: number;
  sum_fee_other: number;
  sum_net_received: number;
}
