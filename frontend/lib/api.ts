import type { DataRow, FactRow, AggRow, ProcessRequest, PreviewRequest } from "./types"

/**
 * Simulate network delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Upload files to server (mock)
 */
export async function uploadFiles(formData: FormData): Promise<{ uploadId: string }> {
  await delay(600 + Math.random() * 600)

  return {
    uploadId: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }
}

/**
 * Process uploaded data (mock)
 */
export async function processData(request: ProcessRequest): Promise<void> {
  await delay(800 + Math.random() * 800)
}

/**
 * Generate mock data row
 */
function generateMockRow(index: number): DataRow {
  const qtySold = Math.floor(Math.random() * 500) + 10
  const avgPrice = Math.random() * 200 + 50
  const recvCustomer = qtySold * avgPrice
  const recvPlatform = recvCustomer * (0.85 + Math.random() * 0.1)
  const extraCharge = Math.random() * 100
  const platformComm = recvCustomer * (0.05 + Math.random() * 0.05)
  const affiliate = recvCustomer * (0.02 + Math.random() * 0.03)
  const other = Math.random() * 50
  const netReceived = recvPlatform + extraCharge - platformComm - affiliate - other

  return {
    internal_sku: `SKU-${String(index + 1).padStart(6, "0")}`,
    qty_sold: qtySold,
    sum_recv_customer: Number.parseFloat(recvCustomer.toFixed(2)),
    sum_recv_platform: Number.parseFloat(recvPlatform.toFixed(2)),
    sum_extra_charge: Number.parseFloat(extraCharge.toFixed(2)),
    sum_fee_platform_comm: Number.parseFloat(platformComm.toFixed(2)),
    sum_fee_affiliate: Number.parseFloat(affiliate.toFixed(2)),
    sum_fee_other: Number.parseFloat(other.toFixed(2)),
    sum_net_received: Number.parseFloat(netReceived.toFixed(2)),
  }
}

/**
 * Generate mock fact row
 */
function generateMockFactRow(index: number, platform: string, year: number, month: number): FactRow {
  const qtySold = Math.floor(Math.random() * 50) + 1
  const avgPrice = Math.random() * 200 + 50
  const recvCustomer = qtySold * avgPrice
  const recvPlatform = recvCustomer * (0.85 + Math.random() * 0.1)
  const extraCharge = Math.random() * 100
  const platformComm = recvCustomer * (0.05 + Math.random() * 0.05)
  const affiliate = recvCustomer * (0.02 + Math.random() * 0.03)
  const other = Math.random() * 50
  const netReceived = recvPlatform + extraCharge - platformComm - affiliate - other

  // line_count and line_no are only for wechat_video
  const hasLineInfo = platform === "wechat_video"

  return {
    year,
    month,
    order_id: `ORD-${year}${String(month).padStart(2, "0")}-${String(index + 1).padStart(8, "0")}`,
    line_count: hasLineInfo ? Math.floor(Math.random() * 5) + 1 : null,
    line_no: hasLineInfo ? Math.floor(Math.random() * 5) + 1 : null,
    internal_sku: `SKU-${String(Math.floor(Math.random() * 1000) + 1).padStart(6, "0")}`,
    fin_code: `FIN-${String(Math.floor(Math.random() * 100) + 1).padStart(4, "0")}`,
    qty_sold: qtySold,
    recv_customer: Number.parseFloat(recvCustomer.toFixed(2)),
    recv_platform: Number.parseFloat(recvPlatform.toFixed(2)),
    extra_charge: Number.parseFloat(extraCharge.toFixed(2)),
    fee_platform_comm: Number.parseFloat(platformComm.toFixed(2)),
    fee_affiliate: Number.parseFloat(affiliate.toFixed(2)),
    fee_other: Number.parseFloat(other.toFixed(2)),
    net_received: Number.parseFloat(netReceived.toFixed(2)),
  }
}

/**
 * Fetch aggregated data (mock) - New 6-column format
 * Aggregates by internal_sku × year × month
 */
export async function fetchAgg(request: PreviewRequest): Promise<{ rows: AggRow[] }> {
  await delay(400 + Math.random() * 400)

  const factRowCount = Math.floor(Math.random() * 200) + 100
  const factRows = Array.from({ length: factRowCount }, (_, i) =>
    generateMockFactRow(i, request.platform, request.year, request.month),
  )

  // Filter by SKU if provided
  const filteredRows = request.sku
    ? factRows.filter((row) => row.internal_sku.toLowerCase().includes(request.sku!.toLowerCase()))
    : factRows

  // Aggregate by internal_sku
  const aggMap = new Map<string, AggRow>()

  for (const row of filteredRows) {
    const existing = aggMap.get(row.internal_sku)

    if (existing) {
      existing.qty_sold_sum += row.qty_sold
      existing.income_total_sum += row.recv_customer + row.recv_platform + row.extra_charge
      existing.fee_platform_comm_sum += row.fee_platform_comm
      existing.fee_other_sum += row.fee_affiliate + row.fee_other
      existing.net_received_sum += row.net_received
    } else {
      aggMap.set(row.internal_sku, {
        internal_sku: row.internal_sku,
        qty_sold_sum: row.qty_sold,
        income_total_sum: row.recv_customer + row.recv_platform + row.extra_charge,
        fee_platform_comm_sum: row.fee_platform_comm,
        fee_other_sum: row.fee_affiliate + row.fee_other,
        net_received_sum: row.net_received,
      })
    }
  }

  // Convert to array and round values
  const rows = Array.from(aggMap.values()).map((row) => ({
    ...row,
    qty_sold_sum: Math.round(row.qty_sold_sum),
    income_total_sum: Number.parseFloat(row.income_total_sum.toFixed(2)),
    fee_platform_comm_sum: Number.parseFloat(row.fee_platform_comm_sum.toFixed(2)),
    fee_other_sum: Number.parseFloat(row.fee_other_sum.toFixed(2)),
    net_received_sum: Number.parseFloat(row.net_received_sum.toFixed(2)),
  }))

  return { rows }
}

/**
 * Fetch fact data (mock)
 */
export async function fetchFact(request: PreviewRequest): Promise<{ rows: FactRow[] }> {
  await delay(400 + Math.random() * 400)

  const rowCount = Math.floor(Math.random() * 200) + 100 // 100-300 rows
  let rows = Array.from({ length: rowCount }, (_, i) =>
    generateMockFactRow(i, request.platform, request.year, request.month),
  )

  // Filter by SKU if provided
  if (request.sku) {
    rows = rows.filter((row) => row.internal_sku.toLowerCase().includes(request.sku!.toLowerCase()))
  }

  return { rows }
}

/**
 * Generate export URL (mock)
 */
export function exportXlsxUrl(params: {
  platform: string
  year: number
  month: number
  view?: "fact" | "agg" // Add view parameter
}): string {
  const searchParams = new URLSearchParams({
    platform: params.platform,
    year: String(params.year),
    month: String(params.month),
  })

  if (params.view) {
    searchParams.set("view", params.view)
  }

  return `/api/export?${searchParams.toString()}`
}

export const fetchPreview = fetchFact
