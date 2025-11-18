/**
 * 清空历史数据 API
 * POST /api/clear-settlement
 * body: { platform: string, year: number, month: number }
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveUserId } from '@/lib/user';
import { clearSettlementForPeriod } from '@/lib/datasets';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = resolveUserId(req);

    const body = await req.json().catch(() => ({} as any));
    const platformRaw = body?.platform;
    const yearRaw = body?.year;
    const monthRaw = body?.month;

    // 平台校验（与现有路由保持一致）
    const validPlatforms = ['xiaohongshu', 'douyin', 'wechat_video'];
    const platform = typeof platformRaw === 'string' ? String(platformRaw).toLowerCase().trim() : '';
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: 'invalid_params', message: `平台参数不合法，支持: ${validPlatforms.join(', ')}` },
        { status: 400 }
      );
    }

    // 年月校验
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isInteger(year)) {
      return NextResponse.json(
        { error: 'invalid_params', message: '年份参数不合法' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'invalid_params', message: '月份参数不合法，应在1-12之间' },
        { status: 400 }
      );
    }

    // 记录请求日志
    console.log('[clear-api] request', { userId, platform, year, month });

    // 在清理前列出该周期所有相关 dataset（便于诊断是否存在多条记录）
    try {
      const { readFile } = await import('node:fs/promises');
      const path = (await import('node:path')).default;
      const file = path.join(process.cwd(), 'frontend', 'data', 'datasets.json');
      const txt = await readFile(file, 'utf-8').catch(() => '[]');
      const all = JSON.parse(txt);
      const related = Array.isArray(all)
        ? all.filter((d: any) => d.userId === userId && d.platform === platform && d.year === year && d.month === month)
        : [];
      console.log('[clear-api-debug] before datasets', related.map((d: any) => ({ id: d.id, status: d.status, metadata: d.metadata })));
    } catch {}

    const result = await clearSettlementForPeriod(userId, platform, year, month);

    if (result.status === 'not_found') {
      console.log('[clear-api] not found', { userId, platform, year, month });
      return NextResponse.json(
        { error: 'not_found', message: '当前条件下未找到可清空的数据' },
        { status: 404 }
      );
    }

    // 清理成功
    console.log('[clear-api] cleared', {
      userId,
      platform,
      year,
      month,
      datasetId: result.datasetId,
      jobIds: result.jobIds,
    });

    console.log('[clear-api-debug] result', {
      platform,
      year,
      month,
      status: 'ok',
      datasetId: result.datasetId,
      jobIds: result.jobIds,
    })

    // 清理后再列一遍该周期 datasets
    try {
      const { readFile } = await import('node:fs/promises');
      const path = (await import('node:path')).default;
      const file = path.join(process.cwd(), 'frontend', 'data', 'datasets.json');
      const txt = await readFile(file, 'utf-8').catch(() => '[]');
      const all = JSON.parse(txt);
      const related = Array.isArray(all)
        ? all.filter((d: any) => d.userId === userId && d.platform === platform && d.year === year && d.month === month)
        : [];
      console.log('[clear-api-debug] after datasets', related.map((d: any) => ({ id: d.id, status: d.status, metadata: d.metadata })));
    } catch {}

    return NextResponse.json({
      status: 'ok',
      datasetId: result.datasetId,
      jobIds: result.jobIds ?? [],
    });
  } catch (err: any) {
    console.error('[clear-api] unexpected error', err);
    return NextResponse.json(
      { error: 'internal_error', message: '清空历史数据时发生内部错误' },
      { status: 500 }
    );
  }
}
