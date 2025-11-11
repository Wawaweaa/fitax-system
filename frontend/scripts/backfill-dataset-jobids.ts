import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { upsertDatasetMetadata, getDataset, generateDatasetId } from '../lib/datasets';
import { ensureDir } from '../lib/server-utils';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const DATA_DIR = path.join(process.cwd(), 'data');
const DATASETS_FILE = path.join(DATA_DIR, 'datasets.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

interface JobRecord {
  id: string;
  datasetId?: string;
  status?: string;
  metadata?: Record<string, any>;
}

async function backfillJobIds(): Promise<void> {
  await ensureDir(DATA_DIR);

  if (!fs.existsSync(JOBS_FILE)) {
    throw new Error(`jobs.json not found at ${JOBS_FILE}`);
  }

  const rawJobs = await readFile(JOBS_FILE, 'utf-8');
  const jobs: JobRecord[] = JSON.parse(rawJobs);

  const datasetJobMap = new Map<string, Set<string>>();

  for (const job of jobs) {
    if (!job.datasetId || !job.id) {
      continue;
    }
    if (job.status && !['completed', 'succeeded'].includes(job.status)) {
      continue;
    }
    if (!datasetJobMap.has(job.datasetId)) {
      datasetJobMap.set(job.datasetId, new Set());
    }
    datasetJobMap.get(job.datasetId)!.add(job.id);
  }

  const updates: Array<{ datasetId: string; jobIds: string[] }> = [];

  for (const [datasetId, idSet] of datasetJobMap.entries()) {
    const jobIds = Array.from(idSet).sort();
    if (jobIds.length === 0) continue;

    const existing = await getDataset(datasetId);
    if (!existing) {
      console.warn(`[backfill] Dataset not found for ${datasetId}, skipping`);
      continue;
    }

    await upsertDatasetMetadata(datasetId, {
      jobId: jobIds[jobIds.length - 1],
      jobIds,
    });
    updates.push({ datasetId, jobIds });
  }

  if (updates.length === 0) {
    console.log('[backfill] No datasets required metadata updates');
  } else {
    console.log(`[backfill] Updated ${updates.length} datasets:`);
    for (const item of updates) {
      console.log(`  - ${item.datasetId}: ${item.jobIds.length} jobIds`);
    }
  }
}

const SMALL_FILE_THRESHOLD = 1024; // bytes

function collectParquetFiles(): string[] {
  const baseDir = path.join(DATA_DIR, 'parquet');
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const results: string[] = [];

  const stack: string[] = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.parquet')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

async function cleanupSmallParquet(): Promise<void> {
  const parquetFiles = collectParquetFiles();
  const removed: string[] = [];

  for (const file of parquetFiles) {
    const stat = fs.statSync(file);
    if (stat.size < SMALL_FILE_THRESHOLD) {
      fs.unlinkSync(file);
      removed.push(file);
    }
  }

  if (removed.length === 0) {
    console.log('[cleanup] No small parquet files found');
  } else {
    console.log(`[cleanup] Removed ${removed.length} parquet files smaller than ${SMALL_FILE_THRESHOLD} bytes`);
    removed.forEach(f => console.log(`  - ${f}`));
  }
}

async function main(): Promise<void> {
  await backfillJobIds();
  await cleanupSmallParquet();
}

main().catch(err => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
