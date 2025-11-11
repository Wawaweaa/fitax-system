"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorCard } from "@/components/error-card"
import { FileStatusList } from "@/components/file-status-list"
import { PlatformSelect } from "@/components/platform-select"
import { WorkflowSteps } from "@/components/workflow-steps"
import { FilterBar } from "@/components/filter-bar"
import { FactTable } from "@/components/fact-table"
import { FactTotalsRow } from "@/components/fact-totals-row"
import { AggTable } from "@/components/agg-table"
import { AggTotalsRow } from "@/components/agg-totals-row"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { EmptyState } from "@/components/empty-state"
import { processData, uploadFiles, fetchFact, fetchAgg, exportXlsx, clearSettlement } from "@/lib/api"
import { getPlatformConfig } from "@/lib/platform-config"
import type {
  Platform,
  UploadedFile,
  UploadFilesMap,
  DataRow,
  FactRow,
  AggRow,
  ViewType,
  UploadFileType,
  ProcessRequest,
} from "@/lib/types"

export default function UploadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [platform, setPlatform] = useState<Platform>(
    (searchParams.get("platform") as Platform) || undefined
  )
  const [files, setFiles] = useState<UploadFilesMap>({})
  const [processState, setProcessState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState<string>()

  const [showPreview, setShowPreview] = useState(false)
  const [year, setYear] = useState(Number(searchParams.get("year")) || 2025)
  const [month, setMonth] = useState(Number(searchParams.get("month")) || 8)
  const [sku, setSku] = useState(searchParams.get("sku") || "")
  const [view, setView] = useState<ViewType>((searchParams.get("view") as ViewType) || "row-level")

  const [factData, setFactData] = useState<FactRow[]>([])
  const [aggData, setAggData] = useState<AggRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string>()
  const [clearing, setClearing] = useState(false)
  const [previewPolling, setPreviewPolling] = useState(false)

  const platformConfig = platform ? getPlatformConfig(platform) : undefined
  const allFilesUploaded = platformConfig && platformConfig.requiredFiles.every((rf) => files[rf.key])

  const workflowSteps = [
    { label: "选择平台", completed: !!platform },
    { label: "上传文件", completed: !!allFilesUploaded },
    { label: "处理并预览", completed: showPreview },
    { label: "导出数据", completed: false },
  ]

  const loadData = async () => {
    if (!platform) return

    setDataLoading(true)
    setDataError(undefined)

    try {
      if (view === "row-level") {
        const result = await fetchFact({ platform, year, month, sku: sku || undefined })
        setFactData(result.rows)
      } else {
        const result = await fetchAgg({ platform, year, month, sku: sku || undefined })
        setAggData(result.rows)
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "加载数据失败")
    } finally {
      setDataLoading(false)
    }
  }

  // 将状态同步到URL
  useEffect(() => {
    if (showPreview) {
      const params = new URLSearchParams()
      if (platform) params.set("platform", platform)
      params.set("year", String(year))
      params.set("month", String(month))
      if (sku) params.set("sku", sku)
      params.set("view", view)

      router.replace(`/?${params.toString()}`)
    }
  }, [platform, year, month, sku, view, showPreview, router])

  // 加载数据
  useEffect(() => {
    if (showPreview) {
      loadData()
    }
  }, [platform, year, month, sku, view, showPreview])

  const handleFileSelect = () => {
    if (!platformConfig) return
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!platformConfig) return

    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    const newFiles: UploadFilesMap = { ...files }

    selectedFiles.forEach((file) => {
      const matchedFile = platformConfig.requiredFiles.find((rf) =>
        rf.patterns.some((pattern) => file.name.toLowerCase().includes(pattern.toLowerCase())),
      )

      if (matchedFile) {
        newFiles[matchedFile.key] = { key: matchedFile.key, file }
      }
    })

    setFiles(newFiles)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // 轮询 /api/preview（行级）直到有数据或超时
  const pollPreviewUntilReady = async (
    pf: Platform,
    y: number,
    m: number,
    timeoutMs = 30000,
    intervalMs = 1500,
  ): Promise<FactRow[] | null> => {
    const start = Date.now()
    setPreviewPolling(true)
    try {
      let attempt = 0
      // 仅轮询行级视图，满足“27 行出现即可”
      while (Date.now() - start < timeoutMs) {
        attempt += 1
        try { console.log('[preview-poll] attempt', { attempt, pf, y, m }) } catch {}
        const { rows } = await fetchFact({ platform: pf, year: y, month: m })
        if (Array.isArray(rows) && rows.length > 0) {
          try { console.log('[preview-poll] ready', { rowsLength: rows.length }) } catch {}
          return rows
        }
        await sleep(intervalMs)
      }
      try { console.warn('[preview-poll] timeout', { pf, y, m, timeoutMs }) } catch {}
      return null
    } finally {
      setPreviewPolling(false)
    }
  }

  const handleProcess = async () => {
    if (!platform || !allFilesUploaded) return

    setProcessState("loading")
    setError(undefined)

    try {
      const formData = new FormData()
      Object.entries(files).forEach(([key, file]) => {
        formData.append(key, file.file)
      })
      formData.append("platform", platform)

      const uploadResults = await uploadFiles(formData)

      const nextFiles: UploadFilesMap = { ...files }
      // 兼容处理：遍历上传结果映射，更新对应文件的 uploadId 等信息
      for (const [k, result] of Object.entries(uploadResults)) {
        const key = k as UploadFileType
        if (!result) continue
        if (!nextFiles[key]) continue
        nextFiles[key] = {
          ...nextFiles[key],
          uploadId: result.uploadId,
          contentHash: result.contentHash,
          isDuplicateFile: result.isDuplicateFile,
        }
      }
      setFiles(nextFiles)

      const settlementUpload = uploadResults.settlement?.uploadId
      if (!settlementUpload) {
        throw new Error("结算文件上传失败，请重试")
      }

      // 调试：在发起 /api/process 之前记录当前组件状态的 platform/year/month
      try {
        console.log('[handleProcess] state before process', { platform, year, month })
      } catch {}

      // 在首次处理时，用户尚未在 UI 选择年/月；尝试从文件名中推断年/月（例如：25年9月 或 2025年9月）
      const settlementFileName = files['settlement']?.file?.name
      const inferYearMonthFromFilename = (name?: string): { year?: number; month?: number } => {
        if (!name) return {}
        const text = name.toLowerCase()
        // 1) 形如 “2025年8月” 或 “25年8月”
        const m1 = text.match(/(20\d{2}|\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/)
        if (m1) {
          const y = m1[1].length === 2 ? 2000 + Number(m1[1]) : Number(m1[1])
          const mm = Number(m1[2])
          return { year: y, month: mm }
        }
        // 2) 仅出现“x月”时，尽力从同名中提取四位年份或两位年份
        const mMonthOnly = text.match(/(1[0-2]|0?[1-9])\s*月/)
        if (mMonthOnly) {
          const mm = Number(mMonthOnly[1])
          const y4 = text.match(/20\d{2}/)
          if (y4) return { year: Number(y4[0]), month: mm }
          const y2 = text.match(/(?:^|[^\d])(\d{2})(?:[^\d]|$)/)
          if (y2) return { year: 2000 + Number(y2[1]), month: mm }
        }
        return {}
      }

      const inferred = inferYearMonthFromFilename(settlementFileName)
      const effectiveYear = inferred.year ?? year
      const effectiveMonth = inferred.month ?? month

      // 若推断出更准确的年月，更新到 state，便于后续预览/导出保持一致
      if (inferred.year && inferred.year !== year) setYear(inferred.year)
      if (inferred.month && inferred.month !== month) setMonth(inferred.month)
      try {
        if (inferred.year || inferred.month) {
          console.log('[handleProcess] inferred from filename', {
            filename: settlementFileName,
            inferredYear: inferred.year,
            inferredMonth: inferred.month,
            effectiveYear,
            effectiveMonth,
          })
        }
      } catch {}

      const payload: ProcessRequest = {
        platform,
        year: effectiveYear,
        month: effectiveMonth,
        uploads: {
          settlementUploadId: settlementUpload,
          ordersUploadId: uploadResults.orders?.uploadId,
        },
      }

      const proc = await processData(payload)

      // 标记为处理中，直到预览可读
      setProcessState("loading")
      setShowPreview(true)
      // 将 jobId 记录下来：
      // - 正常处理：返回新 jobId
      // - duplicate_reused：返回历史 jobId（可能为空，视 metadata 而定）
      if (proc.jobId) {
        ;(window as any).__lastJobId = proc.jobId
      }

      // duplicate_reused 也走轮询预览路径，保证 UI 一致
      const readyRows = await pollPreviewUntilReady(platform, effectiveYear, effectiveMonth)
      if (readyRows && readyRows.length > 0) {
        setDataError(undefined)
        setFactData(readyRows)
        setProcessState("success")
      } else {
        // 超时提示，用户可手动刷新或再次点击
        setDataError('处理完成但预览未就绪，请稍后重试或刷新')
        setProcessState("idle")
      }
    } catch (err) {
      setProcessState("error")
      setError(err instanceof Error ? err.message : "处理失败，请重试")
    }
  }

  const handleExport = async () => {
    if (!platform) return
    await exportXlsx({
      platform,
      year,
      month,
      view: view === "row-level" ? "fact" : "agg",
      jobId: (window as any).__lastJobId
    })
  }

  const handleClear = async () => {
    if (!platform || !year || !month) return
    const platformLabel = platform === 'wechat_video' ? '视频号' : platform === 'xiaohongshu' ? '小红书' : '抖音'
    const label = `${platformLabel} ${year}/${month} 月`
    if (!(window as any).confirm?.(`确认清空 ${label} 的历史数据？清空后需要重新上传并重新处理。`)) {
      return
    }

    try {
      setClearing(true)
      // 清掉本地错误态
      setError(undefined)
      await clearSettlement({ platform, year, month })
      // 成功后重置预览态
      setShowPreview(true) // 保持在预览页
      setFactData([])
      setAggData([])
      // 触发一次数据加载（会得到空态）
      await loadData()
      // 简单提示（如项目内有 toast 可替换）
      console.log('[ui] 清空成功')
    } catch (e: any) {
      console.error('[ui] 清空失败', e)
      ;(window as any).alert?.(`清空失败: ${e?.message ?? '请稍后再试'}`)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-balance py-2">上午好啊</h1>
          <div className="py-1">
            <WorkflowSteps steps={workflowSteps} />
          </div>
        </div>

        <div className="space-y-8">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-8">
            <div className="w-[144px]">
              <PlatformSelect value={platform} onChange={setPlatform} highlighted={!platform} />
            </div>

            <Button
              variant={platform && !allFilesUploaded ? "default" : "outline"}
              onClick={handleFileSelect}
              disabled={!platform}
              className="gap-2 w-[144px]"
            >
              <Upload className="h-4 w-4" />
              上传文件
            </Button>

            <Button
              variant={allFilesUploaded && !showPreview ? "default" : "outline"}
              onClick={handleProcess}
              disabled={!allFilesUploaded || processState === "loading" || previewPolling}
              className="w-[144px]"
            >
              {processState === "loading" || previewPolling ? "处理中..." : "处理并预览"}
            </Button>

            <Button
              variant={showPreview ? "default" : "outline"}
              disabled={!showPreview || (view === 'row-level' ? factData.length === 0 : aggData.length === 0)}
              onClick={handleExport}
              className="w-[180px] gap-2"
            >
              <Download className="h-4 w-4" />
              导出 xlsx ({view === "row-level" ? "行级" : "汇总"})
            </Button>
            <Button
              variant={showPreview ? "destructive" : "outline"}
              disabled={clearing}
              onClick={handleClear}
              className="w-[120px]"
            >
              {clearing ? '清空中...' : '清空数据'}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="border-t" />

          {platformConfig && <FileStatusList requiredFiles={platformConfig.requiredFiles} files={files} />}

          {error && (
            <ErrorCard
              message={error}
              onRetry={() => {
                setProcessState("idle")
                setError(undefined)
              }}
            />
          )}

          {showPreview && (
            <>
              <div className="border-t" />

              <div className="space-y-6">
                <div className="flex flex-col gap-4">
                  <ToggleGroup
                    type="single"
                    value={view}
                    onValueChange={(v) => {
                      if (v) setView(v as ViewType)
                    }}
                    className="self-start"
                  >
                    <ToggleGroupItem value="row-level" aria-label="行级视图">
                      行级(A–O)
                    </ToggleGroupItem>
                    <ToggleGroupItem value="summary" aria-label="汇总视图">
                      汇总(月×SKU)
                    </ToggleGroupItem>
                  </ToggleGroup>

                  <FilterBar
                    platform={platform!}
                    year={year}
                    month={month}
                    sku={sku}
                    onPlatformChange={setPlatform}
                    onYearChange={setYear}
                    onMonthChange={setMonth}
                    onSkuChange={setSku}
                  />
                </div>

                {dataLoading && <LoadingSkeleton />}

                {dataError && <ErrorCard message={dataError} onRetry={loadData} />}

                {!dataLoading && !dataError && (
                  view === "row-level" ? (
                    factData.length === 0 ? (
                      <EmptyState message="未找到符合条件的数据" />
                    ) : (
                      <>
                        <FactTotalsRow data={factData} />
                        <FactTable data={factData} platform={platform!} />
                      </>
                    )
                  ) : (
                    aggData.length === 0 ? (
                      <EmptyState message="未找到符合条件的数据" />
                    ) : (
                      <>
                        <AggTotalsRow data={aggData} />
                        <AggTable data={aggData} />
                      </>
                    )
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
