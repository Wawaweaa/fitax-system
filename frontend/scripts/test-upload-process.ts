// frontend/scripts/test-upload-process.ts
/**
 * 本地自测：上传 → 处理 → 预览（校验行数）→ 导出（校验响应头）
 * 运行示例：
 * npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *   scripts/test-upload-process.ts --platform wechat_video --file ./demo-data/视频号.xlsx \
 *   --year 2025 --month 8 --host http://127.0.0.1:3000 --user test-user-001
 */

import { readFile } from 'fs/promises';
import path from 'path';

type UploadResponse = {
  request_id?: string;
  data?: {
    files?: Array<{
      uploadId: string;
      fileType?: string;
    }>;
  };
  files?: Array<{
    uploadId: string;
    fileType?: string;
  }>;
};

type Args = {
  platform: 'xiaohongshu' | 'douyin' | 'wechat_video';
  file: string;
  year: number;
  month: number;
  host: string;
  user: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string, d?: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const platform = (get('platform') as Args['platform']) ?? 'wechat_video';
  const file = get('file');
  const year = Number(get('year') ?? '2025');
  const month = Number(get('month') ?? '8');
  const host = get('host', 'http://127.0.0.1:3000')!;
  const user = get('user', process.env.DEFAULT_USER_ID || 'test-user-001')!;
  if (!file) throw new Error('缺少 --file 路径');
  return { platform, file, year, month, host, user };
}

async function main() {
  const { platform, file, year, month, host, user } = parseArgs();
  console.log('[cfg]', { platform, file, year, month, host, user });

  // 1) 上传
  const buf = await readFile(file);
  const originalFilename = path.basename(file);
  const settlementFile = new File([buf], originalFilename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fd = new FormData();
  fd.append('platform', platform);
  fd.append('settlement', settlementFile);

  const uploadRes = await fetch(`${host}/api/upload`, {
    method: 'POST',
    headers: { 'x-user-id': user },
    body: fd,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`/api/upload 失败：${uploadRes.status} ${t}`);
  }
  const uploadJson: UploadResponse = await uploadRes.json();
  console.log('[upload]', uploadJson);

  const filesPayload = uploadJson?.data?.files || uploadJson?.files || [];
  const settlementUploadId = filesPayload.find((item) => item?.fileType === 'settlement')?.uploadId || filesPayload[0]?.uploadId;

  if (!settlementUploadId) {
    throw new Error('未从 /api/upload 结果中解析到 settlement uploadId');
  }

  // 2) 处理（入队）
  const procRes = await fetch(`${host}/api/process`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': user,
    },
    body: JSON.stringify({
      platform,
      year,
      month,
      uploads: {
        settlementUploadId,
      },
    }),
  });
  if (!procRes.ok) {
    const t = await procRes.text();
    throw new Error(`/api/process 失败：${procRes.status} ${t}`);
  }
  const procJson = await procRes.json();
  console.log('[process]', procJson);

  // 3) 轮询预览（等待 Worker 产出有效视图）
  const qs = new URLSearchParams({
    platform,
    year: String(year),
    month: String(month),
    view: 'fact',
  }).toString();

  let rows = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const prevRes = await fetch(`${host}/api/preview?${qs}`, {
      headers: { 'x-user-id': user },
    });
    if (prevRes.ok) {
      const json: any = await prevRes.json();
      const dataRows = json?.data?.data || json?.data?.rows || [];
      rows = Array.isArray(dataRows) ? dataRows.length : 0;
      console.log(`[preview] 第${i + 1}次轮询，rows=${rows}`);
      if (rows > 0) break;
    } else {
      console.log(`[preview] ${prevRes.status} 等待中…`);
    }
  }
  if (rows === 0) {
    throw new Error('预览仍无数据，请检查 Worker 是否在消费、或数据是否落盘到 effective/');
  }

  // 4) 导出（校验响应头）
  const expUrl = `${host}/api/export?${qs}`;
  const expRes = await fetch(expUrl, { headers: { 'x-user-id': user } });
  if (!expRes.ok) {
    const t = await expRes.text();
    throw new Error(`/api/export 失败：${expRes.status} ${t}`);
  }
  const ctype = expRes.headers.get('content-type') || '';
  if (!ctype.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
    console.warn('[export] content-type 非 xlsx：', ctype);
  } else {
    console.log('[export] xlsx OK');
  }
  console.log('✅ 自测完成');
}

main().catch((e) => {
  console.error('❌ 自测失败：', e);
  process.exit(1);
});
