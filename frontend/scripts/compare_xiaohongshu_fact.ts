
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { transformXiaohongshuToFact } from '../../backend/lib/adapters/xiaohongshu_core';
import type { FactRow } from '../../frontend/lib/types';

const MODEL_FILE = path.resolve(__dirname, '../../demo-1103-小红书模型-规则样例_251118.xlsx');
const EXPECTED_CSV = path.resolve(__dirname, '../expected/xiaohongshu/expected_fact.csv');

const FIELD_ORDER = [
  'year',
  'month',
  'order_id',
  'line_count',
  'line_no',
  'internal_sku',
  'fin_code',
  'qty_sold',
  'recv_customer',
  'recv_platform',
  'extra_charge',
  'fee_platform_comm',
  'fee_affiliate',
  'fee_other',
  'net_received',
] as const;

interface DiffItem {
  rowIndex: number;      // Row number in data (1-based index relative to data start)
  field: string;
  expected: any;
  actual: any;
  type: 'value_mismatch' | 'extra_row' | 'missing_row';
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function getActualRows(): FactRow[] {
  console.log(`Reading model file: ${MODEL_FILE}`);
  const workbook = XLSX.readFile(MODEL_FILE);

  // Parse Settlement Rows
  const settlementSheet = workbook.Sheets['小红书-结算账单'];
  const settlementData = XLSX.utils.sheet_to_json(settlementSheet, { header: 1 }) as any[][];
  const settlementHeaders = settlementData[0];
  
  const settlementRows: Record<string, any>[] = [];
  for (let i = 1; i < settlementData.length; i++) {
    const row = settlementData[i];
    if (!row || row.length === 0) continue;
    
    const rowObj: Record<string, any> = {};
    // Columns R (17) to BE (56)
    for (let col = 17; col <= 56; col++) {
      const header = settlementHeaders[col];
      if (header) {
        rowObj[header] = row[col];
      }
    }
    if (rowObj['订单号']) {
      settlementRows.push(rowObj);
    }
  }

  // Parse Order Rows
  const orderSheet = workbook.Sheets['小红书-订单明细'];
  const orderData = XLSX.utils.sheet_to_json(orderSheet, { header: 1 }) as any[][];
  const orderHeaders = orderData[0];

  const orderRows: Record<string, any>[] = [];
  for (let i = 1; i < orderData.length; i++) {
    const row = orderData[i];
    if (!row || row.length === 0) continue;

    const rowObj: Record<string, any> = {};
    // Columns A (0) to BS (70)
    for (let col = 0; col <= 70; col++) {
      const header = orderHeaders[col];
      if (header) {
        rowObj[header] = row[col];
      }
    }
    if (rowObj['订单号']) {
      orderRows.push(rowObj);
    }
  }

  console.log(`Parsed ${settlementRows.length} settlement rows and ${orderRows.length} order rows.`);
  return transformXiaohongshuToFact({ settlementRows, orderRows });
}

function getExpectedRows(): Record<string, any>[] {
  console.log(`Reading expected CSV: ${EXPECTED_CSV}`);
  const content = fs.readFileSync(EXPECTED_CSV, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, any>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx]?.replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  
  return rows;
}

function compareRows(expectedRows: Record<string, any>[], actualRows: FactRow[]): DiffItem[] {
  const diffs: DiffItem[] = [];
  const rowCount = Math.max(expectedRows.length, actualRows.length);

  console.log(`Comparing ${expectedRows.length} expected vs ${actualRows.length} actual rows...`);

  for (let i = 0; i < rowCount; i++) {
    const expected = expectedRows[i];
    const actual = actualRows[i] as any; // Access by key

    if (!expected && actual) {
      diffs.push({ rowIndex: i + 1, field: '(row)', expected: null, actual, type: 'extra_row' });
      continue;
    }
    if (expected && !actual) {
      diffs.push({ rowIndex: i + 1, field: '(row)', expected, actual: null, type: 'missing_row' });
      continue;
    }

    for (const field of FIELD_ORDER) {
      let ev = expected[field];
      let av = actual[field];

      // Normalize expected value
      if (ev === undefined || ev === null || ev === '') ev = '';
      
      // Normalize actual value
      if (av === undefined || av === null) av = '';

      if (['year', 'month', 'line_count', 'line_no', 'qty_sold'].includes(field)) {
        // Integer/Discrete fields: Strict equality after number conversion
        const numEv = Number(ev);
        const numAv = Number(av);
        
        if (numEv !== numAv) {
           diffs.push({ rowIndex: i + 1, field, expected: numEv, actual: numAv, type: 'value_mismatch' });
        }
      } else if (['order_id', 'internal_sku', 'fin_code'].includes(field)) {
        // String fields: Trim and compare
        const strEv = String(ev).trim();
        const strAv = String(av).trim();
        if (strEv !== strAv) {
          diffs.push({ rowIndex: i + 1, field, expected: strEv, actual: strAv, type: 'value_mismatch' });
        }
      } else {
        // Float fields: Allow 0.01 tolerance
        let numEv = parseFloat(String(ev));
        if (isNaN(numEv) && (ev === '' || ev === null || ev === undefined)) {
            numEv = 0;
        }
        
        const numAv = parseFloat(String(av));
        
        // Handle remaining NaNs (e.g. garbage string)
        const evValid = !isNaN(numEv);
        const avValid = !isNaN(numAv);
        
        if (!evValid && !avValid) continue; // Both NaN -> Match
        
        if (evValid !== avValid) {
           diffs.push({ rowIndex: i + 1, field, expected: ev, actual: av, type: 'value_mismatch' });
        } else if (Math.abs(numEv - numAv) > 0.01) {
           diffs.push({ rowIndex: i + 1, field, expected: numEv, actual: numAv, type: 'value_mismatch' });
        }
      }
    }
  }

  return diffs;
}

function run() {
  try {
    const actualRows = getActualRows();
    const expectedRows = getExpectedRows();
    
    const diffs = compareRows(expectedRows, actualRows);
    
    if (diffs.length === 0) {
      console.log('\n✅ SUCCESS: All rows match exactly (within tolerances).');
    } else {
      console.log(`\n❌ FAILED: Found ${diffs.length} discrepancies.`);
      console.log('Top 20 diffs:');
      diffs.slice(0, 20).forEach(d => {
        console.log(`Row ${d.rowIndex} [${d.field}]: Expected=${d.expected}, Actual=${d.actual} (${d.type})`);
      });
      process.exit(1);
    }
  } catch (err) {
    console.error('Error running comparison:', err);
    process.exit(1);
  }
}

run();

