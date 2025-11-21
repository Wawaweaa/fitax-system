
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const INPUT_FILE = path.resolve(__dirname, '../../demo-1103-小红书模型-规则样例_251118.xlsx');
const OUTPUT_DIR = path.resolve(__dirname, '../expected/xiaohongshu');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'expected_agg.csv');
const SHEET_NAME = '小红书-结算账单';

// Helper to safely parse float
function parseFloatSafe(val: any): number {
  const num = parseFloat(String(val));
  return isNaN(num) ? 0 : num;
}

// Helper to round to 2 decimals
function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

interface AggData {
  internal_sku: string;
  qty_sold_sum: number;
  income_total_sum: number;
  fee_platform_comm_sum: number;
  fee_other_sum: number;
  net_received_sum: number;
  record_count: number;
}

function exportExpectedAgg() {
  console.log(`Reading file: ${INPUT_FILE}`);
  
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Input file not found at ${INPUT_FILE}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(INPUT_FILE);
  const sheet = workbook.Sheets[SHEET_NAME];

  if (!sheet) {
    console.error(`Error: Sheet "${SHEET_NAME}" not found in workbook.`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  console.log(`Total rows found: ${rows.length}`);

  const aggMap = new Map<string, AggData>();

  // Start from row index 1 (row 2 in Excel)
  let dataRowCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Check valid row (has Order ID at index 2/C)
    if (!row || row.length === 0 || !row[2]) {
      continue;
    }

    // Extract columns for aggregation
    // F: internal_sku (Index 5)
    // H: qty_sold (Index 7)
    // I: recv_customer (Index 8)
    // J: recv_platform (Index 9)
    // K: extra_charge (Index 10)
    // L: fee_platform_comm (Index 11)
    // M: fee_affiliate (Index 12)
    // N: fee_other (Index 13)
    // O: net_received (Index 14)

    const internal_sku = String(row[5] || '').trim();
    if (!internal_sku) continue;

    const qty_sold = parseFloatSafe(row[7]);
    const recv_customer = parseFloatSafe(row[8]);
    const recv_platform = parseFloatSafe(row[9]);
    const extra_charge = parseFloatSafe(row[10]);
    const fee_platform_comm = parseFloatSafe(row[11]);
    const fee_affiliate = parseFloatSafe(row[12]);
    const fee_other = parseFloatSafe(row[13]);
    const net_received = parseFloatSafe(row[14]);

    const income = recv_customer + recv_platform + extra_charge;
    const other_fees = fee_affiliate + fee_other;

    if (!aggMap.has(internal_sku)) {
      aggMap.set(internal_sku, {
        internal_sku,
        qty_sold_sum: 0,
        income_total_sum: 0,
        fee_platform_comm_sum: 0,
        fee_other_sum: 0,
        net_received_sum: 0,
        record_count: 0
      });
    }

    const agg = aggMap.get(internal_sku)!;
    agg.qty_sold_sum += qty_sold;
    agg.income_total_sum += income;
    agg.fee_platform_comm_sum += fee_platform_comm;
    agg.fee_other_sum += other_fees;
    agg.net_received_sum += net_received;
    agg.record_count += 1;
    
    dataRowCount++;
  }

  console.log(`Aggregated ${dataRowCount} source rows into ${aggMap.size} SKUs.`);

  // Convert to CSV
  const csvRows: string[] = [];
  
  // Header
  csvRows.push('internal_sku,qty_sold_sum,income_total_sum,fee_platform_comm_sum,fee_other_sum,net_received_sum,record_count');

  // Data (sorted by sku for consistency)
  const sortedAggs = Array.from(aggMap.values()).sort((a, b) => a.internal_sku.localeCompare(b.internal_sku));

  for (const agg of sortedAggs) {
    const line = [
      agg.internal_sku.includes(',') ? `"${agg.internal_sku}"` : agg.internal_sku,
      agg.qty_sold_sum,
      round2(agg.income_total_sum),
      round2(agg.fee_platform_comm_sum),
      round2(agg.fee_other_sum),
      round2(agg.net_received_sum),
      agg.record_count
    ].join(',');
    csvRows.push(line);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, csvRows.join('\n'), 'utf8');
  console.log(`Successfully wrote to ${OUTPUT_FILE}`);
}

exportExpectedAgg();

