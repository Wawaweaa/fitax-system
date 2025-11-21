
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const INPUT_FILE = path.resolve(__dirname, '../../demo-1103-小红书模型-规则样例_251118.xlsx');
const OUTPUT_DIR = path.resolve(__dirname, '../expected/xiaohongshu');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'expected_fact.csv');
const SHEET_NAME = '小红书-结算账单';

// Column mapping (0-based index for A-O)
const COLUMNS = [
  'year',               // A
  'month',              // B
  'order_id',           // C
  'line_count',         // D
  'line_no',            // E
  'internal_sku',       // F
  'fin_code',           // G
  'qty_sold',           // H
  'recv_customer',      // I
  'recv_platform',      // J
  'extra_charge',       // K
  'fee_platform_comm',  // L
  'fee_affiliate',      // M
  'fee_other',          // N
  'net_received'        // O
];

function exportExpectedFact() {
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

  // Convert sheet to JSON with header: 1 (array of arrays) to get raw values
  // We want the calculated values, which XLSX.readFile does by default for formula cells if they are cached,
  // but sometimes we need to be careful. The user said "read A-O columns (values)".
  // sheet_to_json with header: 1 gives us an array of arrays.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  console.log(`Total rows found: ${rows.length}`);

  const csvRows: string[] = [];
  
  // Add header row
  csvRows.push(COLUMNS.join(','));

  // Start from row index 1 (row 2 in Excel)
  let dataRowCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Check if row is empty or doesn't have enough data (sanity check)
    // We only care about columns A-O (indices 0-14)
    // If the first few columns are empty, it might be an empty row.
    if (!row || row.length === 0 || (!row[0] && !row[2])) {
      continue;
    }

    const extractedRow: any[] = [];
    for (let colIdx = 0; colIdx < 15; colIdx++) {
      let val = row[colIdx];
      
      // Handle null/undefined
      if (val === undefined || val === null) {
        val = '';
      }
      
      // Handle dates if necessary (though description says Year/Month are INTs)
      // Handle numbers: keep them as is or format? 
      // User said "A-O columns values".
      // For CSV, we might want to quote strings if they contain commas.
      
      // Simple CSV escaping
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        extractedRow.push(`"${stringVal.replace(/"/g, '""')}"`);
      } else {
        extractedRow.push(stringVal);
      }
    }
    
    csvRows.push(extractedRow.join(','));
    dataRowCount++;
  }

  console.log(`Extracted ${dataRowCount} data rows.`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`Creating directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write CSV
  fs.writeFileSync(OUTPUT_FILE, csvRows.join('\n'), 'utf8');
  console.log(`Successfully wrote to ${OUTPUT_FILE}`);
}

exportExpectedFact();

