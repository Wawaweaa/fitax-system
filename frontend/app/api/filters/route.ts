import { NextRequest, NextResponse } from 'next/server'
import { getDatasetsFresh } from '@/lib/datasets'
import { resolveUserId } from '@/lib/user'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sp = url.searchParams
    const platform = sp.get('platform') || undefined
    const year = sp.get('year') ? Number(sp.get('year')) : undefined

    const userId = resolveUserId(req)

    const all = await getDatasetsFresh()
    const active = all.filter(
      (d) => d.userId === userId && d.status === 'active'
    )

    // platforms
    const platforms = Array.from(new Set(active.map((d) => d.platform))).sort()

    // years (optionally filtered by platform)
    const yearsBase = platform
      ? active.filter((d) => d.platform === platform)
      : active
    const years = Array.from(new Set(yearsBase.map((d) => d.year))).sort((a, b) => a - b)

    // months (filtered by platform + year)
    let months: number[] = []
    if (platform && typeof year === 'number' && !Number.isNaN(year)) {
      const monthsBase = active.filter(
        (d) => d.platform === platform && d.year === year
      )
      months = Array.from(new Set(monthsBase.map((d) => d.month))).sort(
        (a, b) => a - b
      )
    }

    return NextResponse.json({ data: { platforms, years, months } })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'failed_to_build_filters', message: err?.message || 'unknown' },
      { status: 500 }
    )
  }
}

