import { Redis } from '@upstash/redis';
import { config } from 'dotenv';
import path from 'path';

// 加载 .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error('Upstash Redis credentials not found in .env.local');
  process.exit(1);
}

const redis = new Redis({ url, token, automaticDeserialization: false });

async function clearQueue() {
  try {
    const queueKey = 'fitax:queue';
    const processingKey = 'fitax:processing';
    const failedKey = 'fitax:failed';

    console.log('Clearing queue keys...');
    
    await redis.del(queueKey);
    console.log(`✓ Deleted queue key: ${queueKey}`);
    
    await redis.del(processingKey);
    console.log(`✓ Deleted processing key: ${processingKey}`);
    
    await redis.del(failedKey);
    console.log(`✓ Deleted failed key: ${failedKey}`);
    
    console.log('Queue cleared successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error clearing queue:', err);
    process.exit(1);
  }
}

clearQueue();
