export type Platform = "xiaohongshu" | "douyin" | "wechat_video"

export type ViewType = "row-level" | "summary"

export interface FactRow {
  year: number // A
  month: number // B
  order_id: string // C
  line_count: number | null // D (null for XHS/Douyin)
  line_no: number | null // E (null for XHS/Douyin)
  internal_sku: string // F
  fin_code: string // G
  qty_sold: number // H
  recv_customer: number // I
  recv_platform: number // J
  extra_charge: number // K
  fee_platform_comm: number // L
  fee_affiliate: number // M
  fee_other: number // N
  net_received: number // O
}

export interface DataRow extends FactRow {}

export interface AggRow {
  internal_sku: string // 商家编码
  qty_sold_sum: number // 销售数量 = SUM(H: qty_sold)
  income_total_sum: number // 收入合计 = SUM(I + J + K)
  fee_platform_comm_sum: number // 扣：平台佣金 = SUM(L)
  fee_other_sum: number // 扣：其他费用 = SUM(M + N)
  net_received_sum: number // 应到账金额 = SUM(O)
}

export interface UploadedFile {
  name: string
  size: number
  file: File
}

export interface ProcessRequest {
  platform: Platform
  uploadId: string
  year: number
  month: number
}

export interface PreviewRequest {
  platform: Platform
  year: number
  month: number
  sku?: string
}
