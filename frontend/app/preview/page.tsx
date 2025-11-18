"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { AggTable } from "@/components/agg-table"
import { AggTotalsRow } from "@/components/agg-totals-row"
import { EmptyState } from "@/components/empty-state"
import { ErrorCard } from "@/components/error-card"
import { FactTable } from "@/components/fact-table"
import { FactTotalsRow } from "@/components/fact-totals-row"
import { FilterBar } from "@/components/filter-bar"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fetchAgg, fetchFact, exportXlsxUrl } from "@/lib/api"
import type { AggRow, FactRow, Platform, ViewType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

export default function PreviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [platform, setPlatform] = useState<Platform>((searchParams.get("platform") as Platform) || "xiaohongshu")
  const [year, setYear] = useState(Number(searchParams.get("year")) || 2025)
  const [month, setMonth] = useState(Number(searchParams.get("month")) || 8)
  const [sku, setSku] = useState(searchParams.get("sku") || "")

  const [view, setView] = useState<ViewType>((searchParams.get("view") as ViewType) || "row-level")

  const [factData, setFactData] = useState<FactRow[]>([])
  const [aggData, setAggData] = useState<AggRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const loadData = async () => {
    setLoading(true)
    setError(undefined)

    try {
      if (view === "row-level") {
        const result = await fetchFact({ platform, year, month, sku: sku || undefined })
        setFactData(result.rows)
      } else {
        const result = await fetchAgg({ platform, year, month, sku: sku || undefined })
        setAggData(result.rows)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [platform, year, month, sku, view])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set("platform", platform)
    params.set("year", String(year))
    params.set("month", String(month))
    if (sku) params.set("sku", sku)
    params.set("view", view)
    router.replace(`/preview?${params.toString()}`)
  }, [platform, year, month, sku, view, router])

  const currentData = view === "row-level" ? factData : aggData
  const hasData = currentData.length > 0

  const handleExport = () => {
    const url = exportXlsxUrl({
      platform,
      year,
      month,
      view: view === "row-level" ? "fact" : "agg",
    })
    window.open(url, "_blank")
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">数据预览</h1>
            <p className="text-muted-foreground">查看处理后的统一数据，支持按平台、时间和 SKU 筛选</p>
          </div>
          <Button onClick={handleExport} variant="default" className="gap-2">
            <Download className="h-4 w-4" />
            导出 xlsx ({view === "row-level" ? "行级" : "汇总"})
          </Button>
        </div>

        <div className="space-y-6">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => {
              if (v) setView(v as ViewType)
            }}
          >
            <ToggleGroupItem value="row-level" aria-label="行级视图">
              明细数据
            </ToggleGroupItem>
            <ToggleGroupItem value="summary" aria-label="汇总视图">
              汇总数据
            </ToggleGroupItem>
          </ToggleGroup>

          <FilterBar
            platform={platform}
            year={year}
            month={month}
            sku={sku}
            onPlatformChange={setPlatform}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onSkuChange={setSku}
          />

          {loading && <LoadingSkeleton />}

          {error && <ErrorCard message={error} onRetry={loadData} />}

          {!loading && !error && !hasData && <EmptyState message="未找到符合条件的数据" />}

          {!loading && !error && hasData && (
            <>
              {view === "row-level" ? (
                <>
                  <FactTotalsRow data={factData} />
                  <FactTable data={factData} platform={platform} />
                </>
              ) : (
                <>
                  <AggTotalsRow data={aggData} />
                  <AggTable data={aggData} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
