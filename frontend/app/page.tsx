"use client"

import type React from "react"

import { useRef, useState, useEffect } from "react"
import { Upload, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorCard } from "@/components/error-card"
import { FileStatusList } from "@/components/file-status-list"
import { PlatformSelect } from "@/components/platform-select"
import { WorkflowSteps } from "@/components/workflow-steps"
import { FilterBar } from "@/components/filter-bar"
import { FactTable } from "@/components/fact-table"
import { FactTotalsRow } from "@/components/fact-totals-row"
import { LoadingSkeleton } from "@/components/loading-skeleton"
import { EmptyState } from "@/components/empty-state"
import { processData, uploadFiles, fetchPreview, exportXlsxUrl } from "@/lib/api"
import { getPlatformConfig } from "@/lib/platform-config"
import type { Platform, UploadedFile, DataRow, FactRow } from "@/lib/types"

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [platform, setPlatform] = useState<Platform>()
  const [files, setFiles] = useState<Record<string, UploadedFile>>({})
  const [processState, setProcessState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState<string>()

  const [showPreview, setShowPreview] = useState(false)
  const [year, setYear] = useState(2025)
  const [month, setMonth] = useState(8)
  const [sku, setSku] = useState("")
  const [data, setData] = useState<FactRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string>()

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
      const result = await fetchPreview({ platform, year, month, sku: sku || undefined })
      setData(result.rows)
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "加载数据失败")
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    if (showPreview) {
      loadData()
    }
  }, [platform, year, month, sku, showPreview])

  const handleFileSelect = () => {
    if (!platformConfig) return
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!platformConfig) return

    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    const newFiles = { ...files }

    selectedFiles.forEach((file) => {
      const matchedFile = platformConfig.requiredFiles.find((rf) =>
        rf.patterns.some((pattern) => file.name.toLowerCase().includes(pattern.toLowerCase())),
      )

      if (matchedFile) {
        newFiles[matchedFile.key] = { file, key: matchedFile.key }
      }
    })

    setFiles(newFiles)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
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
      const { uploadId } = await uploadFiles(formData)

      await processData({
        platform,
        uploadId,
        year,
        month,
      })

      setProcessState("success")
      setShowPreview(true)
    } catch (err) {
      setProcessState("error")
      setError(err instanceof Error ? err.message : "处理失败，请重试")
    }
  }

  const handleExport = () => {
    if (!platform) return
    const url = exportXlsxUrl({ platform, year, month })
    window.open(url, "_blank")
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
              disabled={!allFilesUploaded || processState === "loading"}
              className="w-[144px]"
            >
              {processState === "loading" ? "处理中..." : "处理并预览"}
            </Button>

            <Button
              variant={showPreview ? "default" : "outline"}
              disabled={!showPreview}
              onClick={handleExport}
              className="w-[144px] gap-2"
            >
              <Download className="h-4 w-4" />
              导出 xlsx
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

                {dataLoading && <LoadingSkeleton />}

                {dataError && <ErrorCard message={dataError} onRetry={loadData} />}

                {!dataLoading && !dataError && data.length === 0 && <EmptyState message="未找到符合条件的数据" />}

                {!dataLoading && !dataError && data.length > 0 && (
                  <>
                    <FactTotalsRow data={data} />
                    <FactTable data={data} platform={platform!} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
