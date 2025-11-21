
import * as XLSX from 'xlsx';
import * as path from 'path';
import { transformXiaohongshuToFact } from '../../backend/lib/adapters/xiaohongshu_core';

const SETTLEMENT = path.resolve(__dirname, '../../test-上传-小红书_25年10月_结算_251120.xlsx');
const ORDERS = path.resolve(__dirname, '../../test-上传-小红书_25年10月_订单_251120.xlsx');

// Helper to normalize row keys (trim spaces) - same as in core, ensuring we read raw correctly
function normalizeRowKeys(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const trimmedKey = typeof key === 'string' ? key.trim().replace(/\s+/g, ' ') : key;
    normalized[trimmedKey] = value;
  }
  return normalized;
}

async function main() {
  console.log('Reading files...');
  const wbSet = XLSX.readFile(SETTLEMENT);
  const settlementRowsRaw = XLSX.utils.sheet_to_json(wbSet.Sheets[wbSet.SheetNames[0]], { defval: null }) as any[];
  
  const wbOrd = XLSX.readFile(ORDERS);
  const orderRowsRaw = XLSX.utils.sheet_to_json(wbOrd.Sheets[wbOrd.SheetNames[0]], { defval: null }) as any[];

  console.log('Running transformation...');
  const factRows = transformXiaohongshuToFact({ 
    settlementRows: settlementRowsRaw, 
    orderRows: orderRowsRaw 
  });
  
  console.log(`Total FactRows: ${factRows.length}`);

  // 1. Capture Raw Freight per Order (from Settlement Rows)
  // We need to normalize keys first to access '订单号' and '运费' reliably
  const settlementRows = settlementRowsRaw.map(normalizeRowKeys);
  const rawFreightMap = new Map<string, number>();
  
  for (const row of settlementRows) {
    const orderId = String(row['订单号'] || '').trim();
    if (!orderId) continue;
    
    // Assuming '运费' is consistent across rows for the same order in raw file
    // Or we take the one from the first row we see?
    // Code logic: const az = parseFloatSafe(row['运费']); extraCharge = az / count;
    // This implies az is the Total Freight for the Order.
    const freight = parseFloat(String(row['运费'] || 0));
    if (!isNaN(freight)) {
        rawFreightMap.set(orderId, freight);
    }
  }

  // 2. Aggregate Calculated Extra Charge per Order
  const calcExtraChargeMap = new Map<string, { sum: number, count: number, rows: any[] }>();
  
  for (const row of factRows) {
    if (!calcExtraChargeMap.has(row.order_id)) {
      calcExtraChargeMap.set(row.order_id, { sum: 0, count: 0, rows: [] });
    }
    const entry = calcExtraChargeMap.get(row.order_id)!;
    entry.sum += row.extra_charge;
    entry.count += 1;
    entry.rows.push(row);
  }

  // 3. Compare and Find Discrepancies
  console.log('------------------------------------------------');
  console.log('Analyzing Freight (Extra Charge) Discrepancies...');
  
  let diffCount = 0;
  let totalDiff = 0;
  const discrepancies: any[] = [];

  for (const [orderId, entry] of calcExtraChargeMap.entries()) {
    const rawFreight = rawFreightMap.get(orderId) || 0;
    // Note: rawFreight is Total. entry.sum is Sum of (Total/Count rounded).
    
    // Floating point comparison
    const diff = entry.sum - rawFreight;
    
    if (Math.abs(diff) > 0.005) {
      diffCount++;
      totalDiff += diff;
      
      discrepancies.push({
        orderId,
        rawFreight,
        calcSum: entry.sum,
        diff,
        lineCount: entry.count,
        lines: entry.rows.map(r => ({ sku: r.internal_sku, extra: r.extra_charge }))
      });
    }
  }

  // 4. Report
  console.log(`Found ${diffCount} orders with freight mismatch.`);
  console.log(`Total Extra Charge Diff (Fitax - Raw): ${totalDiff.toFixed(4)}`);
  
  console.log('\nTop 20 Discrepancies:');
  discrepancies.slice(0, 20).forEach((d, i) => {
    console.log(`Diff ${i+1}:`);
    console.log(`  Order: ${d.orderId} (Lines: ${d.lineCount})`);
    console.log(`  Raw Freight: ${d.rawFreight} | Fitax Sum: ${d.calcSum.toFixed(2)} | Diff: ${d.diff.toFixed(4)}`);
    console.log(`  Details: ${JSON.stringify(d.lines)}`);
  });

  // Verify if this matches the aggregate discrepancy reported by user (-0.01)
  // If totalDiff is approx -0.01, then we found the root cause.
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

