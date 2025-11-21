
import type { FactRow } from '../../../frontend/lib/types';

export interface XiaohongshuS1Input {
  settlementRows: Record<string, any>[]; // 小红书结算明细的每一行（列名 -> 值）
  orderRows: Record<string, any>[];      // 小红书订单明细的每一行
}

// Helper to parse float safely
function parseFloatSafe(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(String(val));
  return isNaN(num) ? 0 : num;
}

// Helper to parse date
function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'number') {
    // Excel date to JS Date
    // (val - 25569) * 86400 * 1000
    return new Date((val - 25569) * 86400 * 1000);
  }
  return new Date(val);
}

// Helper to normalize row keys (trim spaces)
function normalizeRowKeys(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const trimmedKey =
      typeof key === 'string'
        ? key.trim().replace(/\s+/g, ' ')
        : key;
    normalized[trimmedKey] = value;
  }
  return normalized;
}

function normalizeRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(normalizeRowKeys);
}

// Excel ROUNDUP(x, 0): 绝对值向上取整，带符号（远离 0）
function excelRoundUp0(x: number): number {
  if (!isFinite(x) || x === 0) return 0;
  const sign = x > 0 ? 1 : -1;
  return sign * Math.ceil(Math.abs(x));
}

// Excel ROUNDDOWN(x, 0): 绝对值向下取整，带符号（靠近 0）
function excelRoundDown0(x: number): number {
  if (!isFinite(x) || x === 0) return 0;
  const sign = x > 0 ? 1 : -1;
  return sign * Math.floor(Math.abs(x));
}

// Excel ROUND(x, 2) equivalent
function excelRound2(x: number): number {
  if (!isFinite(x) || x === 0) return 0;

  // 处理浮点误差，比如 1.005 这种
  const factor = 100;
  // 加一个极小偏移量，避免二进制表示误差
  const shifted = x * factor;
  
  // Excel 的 ROUND 是“四舍五入，.5 远离 0”
  const sign = x > 0 ? 1 : -1;
  const abs = Math.abs(shifted);

  const rounded =
    abs - Math.floor(abs) === 0.5
      ? sign * (Math.floor(abs) + 1)  // .5 精确边界：远离 0
      : Math.round(shifted);          // 其他按 JS round

  return rounded / factor;
}

export function transformXiaohongshuToFact(input: XiaohongshuS1Input): FactRow[] {
  // Apply key normalization to input rows
  const settlementRows = normalizeRows(input.settlementRows);
  const orderRows = normalizeRows(input.orderRows);

  // 1. Build Order Lookup Map
  // Key: OrderID + SpecID (R2 & AC2 in Excel) -> (A & O in Order Sheet)
  // Value: Order Row
  const orderMap = new Map<string, Record<string, any>>();
  
  for (const row of orderRows) {
    const orderId = String(row['订单号'] || '').trim();
    const specId = String(row['规格ID'] || '').trim();
    if (orderId) {
      const key = `${orderId}_${specId}`;
      // If duplicate, last one wins? Or first? Excel MATCH finds first.
      if (!orderMap.has(key)) {
        orderMap.set(key, row);
      }
    }
  }

  // 2. Pre-calculate counts for formulas
  // line_count: COUNTIF(R:R, R2) -> Count of rows per OrderID
  // extra_charge_count: COUNTIFS(R:R, R2, AZ:AZ, ">0") -> Count of rows per OrderID where Freight > 0
  const orderLineCounts = new Map<string, number>();
  const orderFreightCounts = new Map<string, number>();

  for (const row of settlementRows) {
    const orderId = String(row['订单号'] || '').trim();
    if (!orderId) continue;

    orderLineCounts.set(orderId, (orderLineCounts.get(orderId) || 0) + 1);

    const freight = parseFloatSafe(row['运费']);
    if (freight > 0) {
      orderFreightCounts.set(orderId, (orderFreightCounts.get(orderId) || 0) + 1);
    }
  }

  // 3. Transform Rows
  const factRows: FactRow[] = [];
  const orderCurrentLineNo = new Map<string, number>();

  for (const row of settlementRows) {
    // Skip empty rows or header-like rows if any
    const orderId = String(row['订单号'] || '').trim();
    if (!orderId) continue;

    // Update line number
    const currentLineNo = (orderCurrentLineNo.get(orderId) || 0) + 1;
    orderCurrentLineNo.set(orderId, currentLineNo);

    // --- Field Calculations ---

    // A: year, B: month
    // V: 结算时间
    const settleTimeVal = row['结算时间'];
    let year = 0;
    let month = 0;
    if (settleTimeVal) {
      const date = parseDate(settleTimeVal);
      if (date && !isNaN(date.getTime())) {
        year = date.getFullYear();
        month = date.getMonth() + 1;
      }
    }

    // C: order_id
    // Already got it.

    // D: line_count
    const lineCount = orderLineCounts.get(orderId) || 0;

    // E: line_no
    const lineNo = currentLineNo;

    // Lookup Order Row
    const specId = String(row['规格ID'] || '').trim();
    const lookupKey = `${orderId}_${specId}`;
    const orderRow = orderMap.get(lookupKey);

    // F: internal_sku
    // Formula: INDEX('小红书-订单明细'!BQ:BQ, MATCH(...))
    // BQ: 商家编码
    const internalSku = orderRow ? String(orderRow['商家编码'] || '') : '';

    // G: fin_code
    // Formula: LEFT(F2, FIND("-",F2)-1)
    let finCode = '';
    const dashIndex = internalSku.indexOf('-');
    if (dashIndex > -1) {
      finCode = internalSku.substring(0, dashIndex);
    } else {
      finCode = internalSku; // Fallback if no dash? Excel would error. Let's keep full SKU or empty?
      // If formula fails, it usually returns error.
      // Let's assume if no dash, use the whole string or handle gracefully.
      // Given the example "Z2183-黑色-XL" -> "Z2183", it seems to extract the style code.
    }

    // H: qty_sold
    // Formula:
    // IF(ABS(BG2)>=1, SUM(AF,AH,AI)/(Order!W/Order!T), IF(ABS(...)>15%, ROUNDUP(...), ROUNDDOWN(...)))
    // BG2 is assumed 0 (undefined).
    // AF: 商品实付/实退
    // AH: 商家优惠
    // AI: 平台优惠补贴
    // Order!W: 商品总价(元)
    // Order!T: SKU件数

    const amountSettle = parseFloatSafe(row['商品实付/实退']); // AH
    const sellerDiscount = parseFloatSafe(row['商家优惠']);   // AJ
    const platformDiscount = parseFloatSafe(row['平台优惠补贴']); // AK
    const numerator = amountSettle + sellerDiscount + platformDiscount;

    let qtySold = 0;
    if (orderRow) {
      const orderW = parseFloatSafe(orderRow['商品总价(元)']);
      const orderT = parseFloatSafe(orderRow['SKU件数']);
      
      if (orderW !== 0 && orderT !== 0) {
        const unitPrice = orderW / orderT;
        const ratio = numerator / unitPrice;
        
        // Logic: IF(ABS(ratio) > 0.15, ROUNDUP(ratio), ROUNDDOWN(ratio))
        // Note: The formula says > 15% (0.15).
        if (Math.abs(ratio) > 0.15) {
          qtySold = excelRoundUp0(ratio); // ROUNDUP
        } else {
          qtySold = excelRoundDown0(ratio); // ROUNDDOWN
        }
      } else {
        qtySold = 0;
      }
    }

    // I: recv_customer
    // Formula: AF2
    const recvCustomer = parseFloatSafe(row['商品实付/实退']);

    // J: recv_platform
    // Formula: AI2 + AJ2
    // AI: 平台优惠补贴, AJ: 平台运费补贴
    const ai = parseFloatSafe(row['平台优惠补贴']); // Re-declare ai for local use
    const aj = parseFloatSafe(row['平台运费补贴']);
    const recvPlatform = ai + aj;

    // K: extra_charge
    // Formula: IF(AZ2<=0, AZ2, AZ2/COUNTIFS(R:R,R2,AZ:AZ,">0"))
    // AZ: 运费
    const az = parseFloatSafe(row['运费']);
    let extraCharge = 0;
    if (az <= 0) {
      extraCharge = az;
    } else {
      const countFreightPos = orderFreightCounts.get(orderId) || 1; // Avoid division by zero
      extraCharge = az / countFreightPos;
    }

    // L: fee_platform_comm
    // Formula: -AM2
    // AM: 佣金总额
    const am = parseFloatSafe(row['佣金总额']);
    const feePlatformComm = -am;

    // M: fee_affiliate
    // Formula: -AT2
    // AT: 分销佣金
    const at = parseFloatSafe(row['分销佣金']);
    const feeAffiliate = -at;

    // N: fee_other
    // Formula: "" -> 0
    const feeOther = 0;
    
    // Construct FactRow before net_received calculation
    const factRow: FactRow = {
      year,
      month,
      order_id: orderId,
      line_count: lineCount,
      line_no: lineNo,
      internal_sku: internalSku,
      fin_code: finCode,
      qty_sold: qtySold,
      recv_customer: round2(recvCustomer),
      recv_platform: round2(recvPlatform),
      extra_charge: round2(extraCharge),
      fee_platform_comm: round2(feePlatformComm),
      fee_affiliate: round2(feeAffiliate),
      fee_other: round2(feeOther),
      net_received: 0 // Calculated below
    };

    // O: net_received
    // Formula: I+J+K-L-M-N
    // Note: Using the values we just calculated (which follow the column formulas)
    factRow.net_received = round2(
      factRow.recv_customer + 
      factRow.recv_platform + 
      factRow.extra_charge - 
      factRow.fee_platform_comm - 
      factRow.fee_affiliate - 
      factRow.fee_other
    );

    factRows.push(factRow);
  }

  return factRows;
}

function round2(num: number): number {
  return excelRound2(num);
}
