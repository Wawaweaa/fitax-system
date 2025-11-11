import { NextRequest, NextResponse } from 'next/server';
import { getJobInfo } from '@/lib/jobs';

/**
 * GET /api/jobs/[id] - 获取作业状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing x-user-id header' },
        { status: 400 }
      );
    }

    // 获取作业
    const job = await getJobInfo(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', jobId },
        { status: 404 }
      );
    }

    // 验证用户权限
    if (job.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json(job);
  } catch (error: any) {
    console.error('[api/jobs/[id]] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
