
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { transformXiaohongshuToFact } from '../../backend/lib/adapters/xiaohongshu_core';
import type { FactRow } from '../../frontend/lib/types';

const MODEL_FILE = path.resolve(__dirname, '../../demo-1103-小红书模型-规则样例_251118.xlsx');
const OUTPUT_FILE = path.resolve(__dirname, '../expected/xiaohongshu/expected_agg.csv');

interface AggRow {
  internal_sku: string;
  qty_sold_sum: number;
  income_total_sum: number;
  fee_platform_comm_sum: number;
  fee_other_sum: number;
  net_received_sum: number;
  record_count: number;
}

function generateAggExpected() {
  console.log(`Reading model file: ${MODEL_FILE}`);
  const workbook = XLSX.readFile(MODEL_FILE);

  // 1. Generate FactRows using Core Logic
  const settlementSheet = workbook.Sheets['小红书-结算账单'];
  const settlementData = XLSX.utils.sheet_to_json(settlementSheet, { header: 1 }) as any[][];
  const settlementHeaders = settlementData[0];
  
  const settlementRows: Record<string, any>[] = [];
  for (let i = 1; i < settlementData.length; i++) {
    const row = settlementData[i];
    if (!row || row.length === 0) continue;
    const rowObj: Record<string, any> = {};
    for (let col = 17; col <= 56; col++) {
      const header = settlementHeaders[col];
      if (header) rowObj[header] = row[col];
    }
    if (rowObj['订单号']) settlementRows.push(rowObj);
  }

  const orderSheet = workbook.Sheets['小红书-订单明细'];
  const orderData = XLSX.utils.sheet_to_json(orderSheet, { header: 1 }) as any[][];
  const orderHeaders = orderData[0];
  
  const orderRows: Record<string, any>[] = [];
  for (let i = 1; i < orderData.length; i++) {
    const row = orderData[i];
    if (!row || row.length === 0) continue;
    const rowObj: Record<string, any> = {};
    for (let col = 0; col <= 70; col++) {
      const header = orderHeaders[col];
      if (header) rowObj[header] = row[col];
    }
    if (rowObj['订单号']) orderRows.push(rowObj);
  }

  const factRows = transformXiaohongshuToFact({ settlementRows, orderRows });
  console.log(`Generated ${factRows.length} FactRows.`);

  // 2. Aggregate Logic (Matches Adapter)
  const skuSummary: Record<string, AggRow> = {};

  for (const row of factRows) {
    const { internal_sku } = row;

    if (!skuSummary[internal_sku]) {
      skuSummary[internal_sku] = {
        internal_sku,
        qty_sold_sum: 0,
        income_total_sum: 0,
        fee_platform_comm_sum: 0,
        fee_other_sum: 0,
        net_received_sum: 0,
        record_count: 0,
      };
    }

    const summary = skuSummary[internal_sku];
    
    summary.qty_sold_sum += row.qty_sold;
    summary.income_total_sum += (row.recv_customer + row.recv_platform + row.extra_charge);
    summary.fee_platform_comm_sum += row.fee_platform_comm;
    summary.fee_other_sum += (row.fee_affiliate + row.fee_other);
    summary.net_received_sum += row.net_received;
    summary.record_count += 1;
  }

  // 3. Format and Sort
  // Sort by internal_sku for consistency
  const aggRows = Object.values(skuSummary).sort((a, b) => a.internal_sku.localeCompare(b.internal_sku));

  // 4. Write CSV
  const headers = [
    'internal_sku', 
    'qty_sold_sum', 
    'income_total_sum', 
    'fee_platform_comm_sum', 
    'fee_other_sum', 
    'net_received_sum', 
    'record_count'
  ];

  const csvLines = [headers.join(',')];

  for (const row of aggRows) {
    // Round floats to 2 decimals
    const line = [
      `"${row.internal_sku}"`, // Quote SKU just in case
      row.qty_sold_sum,
      row.income_total_sum.toFixed(2),
      row.fee_platform_comm_sum.toFixed(2),
      row.fee_other_sum.toFixed(2),
      row.net_received_sum.toFixed(2),
      row.record_count
    ];
    csvLines.push(line.join(','));
  }

  // Ensure directory
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf-8');
  console.log(`Successfully wrote ${aggRows.length} AggRows to ${OUTPUT_FILE}`);
}

generateAggExpected();

