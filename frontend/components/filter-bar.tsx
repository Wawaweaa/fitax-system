"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PLATFORM_CONFIGS } from "@/lib/platform-config"
import type { Platform, ViewType } from "@/lib/types"
import { useEffect, useState } from 'react'
import { getUserId } from '@/lib/client-utils'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

interface FilterBarProps {
  platform: Platform
  year: number
  month: number
  sku: string
  onPlatformChange: (platform: Platform) => void
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  onSkuChange: (sku: string) => void
  // 新增：右侧视图切换（明细数据/汇总数据）
  view: ViewType
  onViewChange: (v: ViewType) => void
}

// 动态 filters：由 /api/filters 提供；此处仅做空态占位
const DEFAULT_YEARS: number[] = []
const DEFAULT_MONTHS: number[] = []

export function FilterBar({
  platform,
  year,
  month,
  sku,
  onPlatformChange,
  onYearChange,
  onMonthChange,
  onSkuChange,
  view,
  onViewChange,
}: FilterBarProps) {
  const [years, setYears] = useState<number[]>(DEFAULT_YEARS)
  const [months, setMonths] = useState<number[]>(DEFAULT_MONTHS)

  // 拉取平台/年/月（级联）
  async function fetchFilters(p?: Platform, y?: number) {
    const params = new URLSearchParams()
    if (p) params.set('platform', p)
    if (typeof y === 'number') params.set('year', String(y))
    const res = await fetch(`/api/filters?${params.toString()}`, {
      headers: { 'x-user-id': getUserId() }
    })
    if (!res.ok) return
    const json = await res.json()
    const data = json?.data || {}
    if (Array.isArray(data.years)) setYears(data.years)
    if (Array.isArray(data.months)) setMonths(data.months)
  }

  // 初始载入：按当前 platform/year 取 filters
  useEffect(() => {
    fetchFilters(platform, year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 平台变化：刷新 years，并回退选值
  useEffect(() => {
    fetchFilters(platform, year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform])

  // 年变化：刷新 months
  useEffect(() => {
    fetchFilters(platform, year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])
  return (
    <Card className="py-4 border-none shadow-none">
      <div className="flex flex-wrap items-end gap-8">
        <div className="space-y-2">
          <Label htmlFor="filter-platform" className="text-sm font-medium text-foreground">平台</Label>
          <Select value={platform} onValueChange={onPlatformChange}>
            <SelectTrigger id="filter-platform" className="px-6 w-[144px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_CONFIGS.map((config) => (
                <SelectItem key={config.value} value={config.value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-year" className="text-sm font-medium text-foreground">年份</Label>
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger id="filter-year" className="px-6 w-[144px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.length === 0 ? (
                <SelectItem value={String(year)}>{year}</SelectItem>
              ) : (
                years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-month" className="text-sm font-medium text-foreground">月份</Label>
          <Select value={String(month)} onValueChange={(v) => onMonthChange(Number(v))}>
            <SelectTrigger id="filter-month" className="px-6 w-[144px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.length === 0 ? (
                <SelectItem value={String(month)}>{month}月</SelectItem>
              ) : (
                months.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}月
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-sku" className="text-sm font-medium text-foreground">平台商品编码</Label>
          <div className="relative w-[110%]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="filter-sku"
              placeholder='输入"订单/编码"'
              value={sku}
              onChange={(e) => onSkuChange(e.target.value)}
              className="pl-9 pr-9"
            />
            {sku && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => onSkuChange("")}
                aria-label="清除搜索"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 右侧视图切换 */}
        <div className="ml-auto">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && onViewChange(v as ViewType)}
          >
            <ToggleGroupItem value="row-level" aria-label="明细数据" className="h-9 px-3 min-w-[120px]">
              <span className="text-sm font-medium text-foreground">明细数据</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="summary" aria-label="汇总数据" className="h-9 px-3 min-w-[120px]">
              <span className="text-sm font-medium text-foreground">汇总数据</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </Card>
  )
}
