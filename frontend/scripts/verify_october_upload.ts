
import * as XLSX from 'xlsx';
import * as path from 'path';
import { transformXiaohongshuToFact } from '../../backend/lib/adapters/xiaohongshu_core';

const SETTLEMENT = path.resolve(__dirname, '../../test-上传-小红书_25年10月_结算_251120.xlsx');
const ORDERS = path.resolve(__dirname, '../../test-上传-小红书_25年10月_订单_251120.xlsx');

// Expected values provided by user
const EXPECTED_QTY_SOLD = 4508;
const EXPECTED_NET_RECEIVED = 1156052.79;
const TOLERANCE = 0.01;

async function main() {
  console.log('Reading settlement file:', SETTLEMENT);
  const wbSet = XLSX.readFile(SETTLEMENT);
  const wsSet = wbSet.Sheets[wbSet.SheetNames[0]];
  const settlementRows = XLSX.utils.sheet_to_json(wsSet, { defval: null }) as any[];

  console.log('Reading orders file:', ORDERS);
  const wbOrd = XLSX.readFile(ORDERS);
  const wsOrd = wbOrd.Sheets[wbOrd.SheetNames[0]];
  const orderRows = XLSX.utils.sheet_to_json(wsOrd, { defval: null }) as any[];

  console.log('Running transformation (with new logic)...');
  const factRows = transformXiaohongshuToFact({ settlementRows, orderRows });
  console.log('[oct-check] total factRows', factRows.length);

  // Calculate Aggregates
  let totalQtySold = 0;
  let totalNetReceived = 0;

  for (const row of factRows) {
    totalQtySold += row.qty_sold;
    totalNetReceived += row.net_received;
  }

  // Round Aggregates for display/comparison (simple round for display)
  // But for net_received, we want to compare with high precision
  
  console.log('------------------------------------------------');
  console.log('AGGREGATION RESULTS:');
  console.log(`Qty Sold:      Actual=${totalQtySold}, Expected=${EXPECTED_QTY_SOLD}, Diff=${totalQtySold - EXPECTED_QTY_SOLD}`);
  console.log(`Net Received:  Actual=${totalNetReceived.toFixed(2)}, Expected=${EXPECTED_NET_RECEIVED.toFixed(2)}, Diff=${(totalNetReceived - EXPECTED_NET_RECEIVED).toFixed(4)}`);
  
  const netDiff = Math.abs(totalNetReceived - EXPECTED_NET_RECEIVED);
  
  if (totalQtySold === EXPECTED_QTY_SOLD && netDiff <= TOLERANCE) {
    console.log('✅ SUCCESS: Aggregates match exactly (within tolerance).');
  } else {
    console.log('❌ FAILURE: Aggregates do not match.');
    
    if (totalQtySold !== EXPECTED_QTY_SOLD) {
        console.log(`Mismatch in Qty Sold: ${totalQtySold - EXPECTED_QTY_SOLD}`);
    }
    if (netDiff > TOLERANCE) {
        console.log(`Mismatch in Net Received: ${totalNetReceived - EXPECTED_NET_RECEIVED}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

