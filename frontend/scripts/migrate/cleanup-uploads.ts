/**
 * 清理上传记录脚本
 * 目标：只保留符合新schema的上传记录（id字段必须存在且以ULP-开头）
 */
import fs from 'fs/promises';
import path from 'path';

const UPLOADS_FILE = path.join(process.cwd(), 'data', 'uploads.json');

interface UploadRecord {
  id?: string;
  userId?: string;
  platform?: string;
  fileType?: string;
  contentHash?: string;
  contenthash?: string;
  originalFilename?: string;
  fileName?: string;
  objectKey?: string;
  size?: number;
  uploadedAt?: string | Date;
  isDuplicate?: boolean;
  [key: string]: any;
}

async function main() {
  console.log('📋 开始清理上传记录...');
  console.log(`📁 文件路径: ${UPLOADS_FILE}`);

  // 读取原始数据
  const rawData = await fs.readFile(UPLOADS_FILE, 'utf-8');
  const records: UploadRecord[] = JSON.parse(rawData);

  console.log(`\n📊 原始记录数: ${records.length}`);

  // 筛选符合新schema的记录
  const validRecords = records.filter((record) => {
    // 必须有 id 字段且以 ULP- 开头
    if (!record.id || !record.id.startsWith('ULP-')) {
      console.log(`❌ 过滤掉无效记录: ${JSON.stringify(record, null, 2)}`);
      return false;
    }

    // 必须有关键字段
    if (!record.userId || !record.platform || !record.fileType) {
      console.log(`⚠️  记录 ${record.id} 缺少关键字段，但保留`);
    }

    return true;
  });

  console.log(`\n✅ 有效记录数: ${validRecords.length}`);
  console.log(`🗑️  已过滤掉: ${records.length - validRecords.length} 条记录`);

  // 统一字段命名：contenthash -> contentHash
  const normalizedRecords = validRecords.map((record) => {
    const normalized: UploadRecord = { ...record };

    // 如果有 contenthash（小写）但没有 contentHash，进行转换
    if (record.contenthash && !record.contentHash) {
      normalized.contentHash = record.contenthash;
      delete normalized.contenthash;
      console.log(`🔄 记录 ${record.id} 的 contenthash 已转换为 contentHash`);
    }

    // 确保 fileName 字段存在
    if (!normalized.fileName && normalized.originalFilename) {
      normalized.fileName = normalized.originalFilename;
    }

    return normalized;
  });

  // 写入清理后的数据
  await fs.writeFile(UPLOADS_FILE, JSON.stringify(normalizedRecords, null, 2), 'utf-8');

  console.log(`\n✨ 清理完成！已写入 ${normalizedRecords.length} 条记录`);
  console.log(`📝 备份文件保留在 data/uploads.backup.*.json`);
}

main().catch((err) => {
  console.error('❌ 清理失败:', err);
  process.exit(1);
});
