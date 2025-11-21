
import * as path from 'path';
import * as fs from 'fs';
import { XiaohongshuAdapter } from '../../backend/lib/adapters/xiaohongshu';
import { generateParquet } from '../../backend/lib/parquet';
import { registerAdapter } from '../../backend/lib/adapters/base';

// Ensure adapter is registered
const adapter = new XiaohongshuAdapter();
registerAdapter(adapter);

const TEST_UPLOAD_ID = 'ULP-TEST-XIAOHONGSHU';
const TEST_JOB_ID = 'JOB-TEST-XIAOHONGSHU';
const TEST_YEAR = 2025;
const TEST_MONTH = 8;

const RAW_SETTLEMENT_FILE = path.resolve(__dirname, '../../demo-小红书结算明细8月_样例_251026.xlsx');
const RAW_ORDER_FILE = path.resolve(__dirname, '../../demo-小红书订单明细8月_样例_251026.xlsx');

async function runSmokeTest() {
  console.log('Starting Xiaohongshu Worker Smoke Test...');

  // 1. Check input files
  if (!fs.existsSync(RAW_SETTLEMENT_FILE) || !fs.existsSync(RAW_ORDER_FILE)) {
    console.error('Raw input files not found!');
    process.exit(1);
  }
  console.log('Input files found.');

  const jobDir = path.join(process.cwd(), 'data', 'worker', TEST_JOB_ID);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  const files = [RAW_SETTLEMENT_FILE, RAW_ORDER_FILE];

  const params = {
    platform: 'xiaohongshu',
    uploadId: TEST_UPLOAD_ID,
    year: TEST_YEAR,
    month: TEST_MONTH,
    files: files,
    jobId: TEST_JOB_ID
  };

  try {
    // 3. Execute Adapter Logic
    console.log('Validating input...');
    const validation = await adapter.validateInput(params);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.message}`);
    }
    console.log('Validation passed.');

    console.log('Processing...');
    const result = await adapter.process(params);
    
    console.log('Processing complete.');
    console.log(`Fact Rows: ${result.factRows.length}`);
    console.log(`Agg Rows: ${result.aggRows.length}`);
    console.log(`Warnings: ${result.warnings.length}`);

    if (result.warnings.length > 0) {
        console.warn('Warnings:', result.warnings.slice(0, 5));
    }

    // 4. Simulate Parquet Generation (Worker Step)
    console.log('Generating Parquet files...');
    
    try {
      if (result.factRows.length > 0) {
        await generateParquet(result.factRows, {
          type: 'fact',
          platform: 'xiaohongshu',
          uploadId: TEST_UPLOAD_ID,
          jobId: TEST_JOB_ID,
          year: TEST_YEAR,
          month: TEST_MONTH,
          outputDir: jobDir,
          uploadToStorage: false // Don't upload to actual S3/Storage in smoke test unless needed
        });
        console.log(`Fact Parquet generated in ${jobDir}`);
      }

      if (result.aggRows.length > 0) {
        await generateParquet(result.aggRows, {
          type: 'agg',
          platform: 'xiaohongshu',
          uploadId: TEST_UPLOAD_ID,
          jobId: TEST_JOB_ID,
          year: TEST_YEAR,
          month: TEST_MONTH,
          outputDir: jobDir,
          uploadToStorage: false
        });
        console.log(`Agg Parquet generated in ${jobDir}`);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('spawn duckdb ENOENT')) {
         console.warn('⚠️  DuckDB CLI not found. Skipping actual Parquet file generation. Data preparation was successful.');
      } else {
         throw e;
      }
    }
    
    console.log('✅ Smoke Test Passed!');

  } catch (err) {
    console.error('❌ Smoke Test Failed:', err);
    process.exit(1);
  }
}

runSmokeTest();
