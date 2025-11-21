
import * as XLSX from 'xlsx';
import * as path from 'path';
import { transformXiaohongshuToFact } from '../../backend/lib/adapters/xiaohongshu_core';

const INPUT_FILE = path.resolve(__dirname, '../../demo-1103-小红书模型-规则样例_251118.xlsx');

function runTest() {
  console.log(`Reading file: ${INPUT_FILE}`);
  const workbook = XLSX.readFile(INPUT_FILE);

  // 1. Parse Settlement Rows (Columns R-BE)
  const settlementSheet = workbook.Sheets['小红书-结算账单'];
  const settlementData = XLSX.utils.sheet_to_json(settlementSheet, { header: 1 }) as any[][];
  const settlementHeaders = settlementData[0];
  
  const settlementRows: Record<string, any>[] = [];
  // Start from row 1 (data)
  for (let i = 1; i < settlementData.length; i++) {
    const row = settlementData[i];
    if (!row || row.length === 0) continue;
    
    const rowObj: Record<string, any> = {};
    // Columns R (17) to BE (56)
    // Note: row array might be sparse or shorter if trailing empty
    for (let col = 17; col <= 56; col++) {
      const header = settlementHeaders[col];
      if (header) {
        rowObj[header] = row[col];
      }
    }
    // Only add if it looks like a valid row (has Order ID at R/17)
    if (rowObj['订单号']) {
      settlementRows.push(rowObj);
    }
  }
  console.log(`Parsed ${settlementRows.length} settlement rows.`);

  // 2. Parse Order Rows (Columns A-BS)
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
  console.log(`Parsed ${orderRows.length} order rows.`);

  // 3. Transform
  console.log('Running transformation...');
  const factRows = transformXiaohongshuToFact({ settlementRows, orderRows });
  console.log(`Generated ${factRows.length} fact rows.`);

  // 4. Print first 3 rows
  console.log('\n--- First 3 Fact Rows ---');
  factRows.slice(0, 3).forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`);
    console.log(JSON.stringify(row, null, 2));
  });

}

runTest();

