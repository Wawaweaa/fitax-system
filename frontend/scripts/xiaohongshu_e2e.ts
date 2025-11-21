
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import * as XLSX from 'xlsx';

// Config
const BASE_URL = 'http://localhost:3000';
const PLATFORM = 'xiaohongshu';
const YEAR = 2025;
const MONTH = 8;
// Use demo files for E2E
const SETTLEMENT_FILE = path.resolve(__dirname, '../../demo-小红书结算明细8月_样例_251026.xlsx');
const ORDER_FILE = path.resolve(__dirname, '../../demo-小红书订单明细8月_样例_251026.xlsx');

const EXPECTED_FACT_CSV = path.resolve(__dirname, '../expected/xiaohongshu/expected_fact.csv');
const EXPECTED_AGG_CSV = path.resolve(__dirname, '../expected/xiaohongshu/expected_agg.csv');

// Define tolerances
const FLOAT_TOLERANCE = 0.01;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to compare CSV data with tolerance
function compareRows(expectedRows: Record<string, any>[], actualRows: Record<string, any>[], fields: string[]): string[] {
  const errors: string[] = [];
  
  // Check row count
  if (expectedRows.length !== actualRows.length) {
    errors.push(`Row count mismatch: Expected ${expectedRows.length}, Actual ${actualRows.length}`);
    return errors; // Stop if counts don't match roughly, but let's try to compare valid rows?
    // If rows are missing, misalignment will be huge.
  }

  for (let i = 0; i < expectedRows.length; i++) {
    const exp = expectedRows[i];
    const act = actualRows[i];
    
    if (!act) {
      errors.push(`Row ${i+1}: Missing actual row`);
      continue;
    }

    for (const field of fields) {
      let ev = exp[field];
      let av = act[field];

      if (ev === undefined || ev === null) ev = '';
      if (av === undefined || av === null) av = '';
      
      ev = String(ev).trim();
      av = String(av).trim();

      // Try parse float
      const en = parseFloat(ev);
      const an = parseFloat(av);

      const isNum = !isNaN(en) && !isNaN(an) && ev !== '' && av !== '';

      if (isNum) {
        if (Math.abs(en - an) > FLOAT_TOLERANCE) {
           errors.push(`Row ${i+1} [${field}]: Expected ${ev}, Actual ${av} (Diff ${Math.abs(en - an)})`);
        }
      } else {
        if (ev !== av) {
           errors.push(`Row ${i+1} [${field}]: Expected '${ev}', Actual '${av}'`);
        }
      }
    }
    if (errors.length > 20) return errors; // Stop early
  }
  return errors;
}

function parseCsv(content: string): Record<string, any>[] {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, any>[] = [];
    
    for (let i = 1; i < lines.length; i++) {
        // Simple split by comma, handles quotes poorly if commas inside.
        // But our expected data usually quotes strings.
        // Regex split for CSV: 
        const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        // This regex is too simple.
        // Let's use a simple parser function or assume standard formatting.
        // For robustness, let's use a simple state machine split or library if available.
        // Or just split by comma if we know data has no commas. SKU might have commas? unlikely.
        // Let's assume generated CSVs are simple.
        
        // Better approach:
        const values: string[] = [];
        let current = '';
        let inQuote = false;
        for(const char of lines[i]) {
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        const row: Record<string, any> = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] ? values[idx].replace(/^"|"$/g, '') : '';
        });
        rows.push(row);
    }
    return rows;
}


async function runE2E() {
  console.log('🚀 Starting Xiaohongshu E2E Test...');

  try {
    // 1. Upload
    console.log('Step 1: Uploading files...');
    const formData = new FormData();
    formData.append('platform', PLATFORM);
    formData.append('settlement', fs.createReadStream(SETTLEMENT_FILE));
    formData.append('orders', fs.createReadStream(ORDER_FILE));

    const uploadRes = await axios.post(`${BASE_URL}/api/upload`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    const files = uploadRes.data.files;
    const settlementUploadId = files.find((f: any) => f.fileType === 'settlement')?.uploadId;
    const ordersUploadId = files.find((f: any) => f.fileType === 'orders')?.uploadId;

    if (!settlementUploadId || !ordersUploadId) {
      throw new Error('Failed to get upload IDs');
    }
    console.log(`[xiaohongshu-e2e] upload done, settlement=${settlementUploadId}, orders=${ordersUploadId}`);

    // 2. Process
    console.log('Step 2: Triggering process...');
    const processRes = await axios.post(`${BASE_URL}/api/process`, {
      platform: PLATFORM,
      year: YEAR,
      month: MONTH,
      mode: 'merge',
      uploads: {
        settlementUploadId,
        ordersUploadId
      }
    });
    
    // Support both direct jobId or if it's wrapped (e.g. re-used job)
    // The API usually returns { jobId: string, status: string }
    const jobId = processRes.data.jobId || processRes.data.data?.jobId;
    console.log(`[xiaohongshu-e2e] process queued, jobId=${jobId}`);

    // 3. Poll Preview
    console.log('Step 3: Polling preview...');
    let factRows: any[] = [];
    let attempts = 0;
    const maxAttempts = 30; // 60s total

    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;
      try {
        const previewRes = await axios.get(`${BASE_URL}/api/preview`, {
          params: { platform: PLATFORM, year: YEAR, month: MONTH, view: 'fact', pageSize: 10 }
        });
        
        const payload = previewRes.data?.data ?? {};
        // Check nested data structure (common in API wrappers: body.data.data)
        // Or sometimes just body.data
        // The user hint suggests: const payload = previewRes.data?.data ?? {};
        // And rows = payload.data
        
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const total = typeof payload?.pagination?.total === 'number'
          ? payload.pagination.total
          : rows.length;

        if (rows.length > 0) {
           factRows = rows;
           console.log(`[xiaohongshu-e2e] preview ready, got ${total} fact rows`);
           break;
        }
      } catch (e) {
        // Ignore 404 or empty during processing
      }
      process.stdout.write('.');
    }
    console.log('');

    if (factRows.length === 0) {
      throw new Error('Timeout waiting for preview data');
    }

    // 4. Export Fact & Compare
    console.log('Step 4: Verifying Fact Export...');
    const exportFactRes = await axios.get(`${BASE_URL}/api/export`, {
      params: { platform: PLATFORM, year: YEAR, month: MONTH, view: 'fact', format: 'csv', inline: '1' },
      responseType: 'text'
    });
    
    const actualFactRows = parseCsv(exportFactRes.data);
    const expectedFactContent = fs.readFileSync(EXPECTED_FACT_CSV, 'utf-8');
    const expectedFactRows = parseCsv(expectedFactContent);

    // Columns to compare (15 fields)
    const factFields = [
        'year','month','order_id','line_count','line_no','internal_sku','fin_code',
        'qty_sold','recv_customer','recv_platform','extra_charge','fee_platform_comm',
        'fee_affiliate','fee_other','net_received'
    ];
    
    const factErrors = compareRows(expectedFactRows, actualFactRows, factFields);
    if (factErrors.length > 0) {
        console.error('❌ Fact Comparison Failed:');
        factErrors.forEach(e => console.error(e));
        process.exit(1);
    }
    console.log('[xiaohongshu-e2e] fact export matches expected_fact (within tolerance)');

    // 5. Export Agg & Compare
    console.log('Step 5: Verifying Agg Export...');
    const exportAggRes = await axios.get(`${BASE_URL}/api/export`, {
      params: { platform: PLATFORM, year: YEAR, month: MONTH, view: 'agg', format: 'csv', inline: '1' },
      responseType: 'text'
    });

    const actualAggRows = parseCsv(exportAggRes.data);
    const expectedAggContent = fs.readFileSync(EXPECTED_AGG_CSV, 'utf-8');
    const expectedAggRows = parseCsv(expectedAggContent);

    const aggFields = [
        'internal_sku','qty_sold_sum','income_total_sum','fee_platform_comm_sum',
        'fee_other_sum','net_received_sum','record_count'
    ];

    // Sort both by internal_sku to ensure alignment
    actualAggRows.sort((a, b) => (a.internal_sku || '').localeCompare(b.internal_sku || ''));
    expectedAggRows.sort((a, b) => (a.internal_sku || '').localeCompare(b.internal_sku || ''));

    const aggErrors = compareRows(expectedAggRows, actualAggRows, aggFields);
    if (aggErrors.length > 0) {
        console.error('❌ Agg Comparison Failed:');
        aggErrors.forEach(e => console.error(e));
        process.exit(1);
    }
    console.log('[xiaohongshu-e2e] agg export matches expected_agg (within tolerance)');

    console.log('\n✅ xiaohongshu E2E passed');

  } catch (err: any) {
    console.error('\n❌ E2E Failed:', err.message);
    if (err.response) {
        console.error('Response data:', err.response.data);
    }
    process.exit(1);
  }
}

runE2E();
