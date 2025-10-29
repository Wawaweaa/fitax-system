"use client"

import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PLATFORM_CONFIGS } from "@/lib/platform-config"
import type { Platform } from "@/lib/types"

interface FilterBarProps {
  platform: Platform
  year: number
  month: number
  sku: string
  onPlatformChange: (platform: Platform) => void
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  onSkuChange: (sku: string) => void
}

const YEARS = [2024, 2025]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function FilterBar({
  platform,
  year,
  month,
  sku,
  onPlatformChange,
  onYearChange,
  onMonthChange,
  onSkuChange,
}: FilterBarProps) {
  return (
    <Card className="py-4 border-none shadow-none">
      <div className="flex flex-wrap gap-8">
        <div className="space-y-2">
          <Label htmlFor="filter-platform">平台</Label>
          <Select value={platform} onValueChange={onPlatformChange}>
            <SelectTrigger id="filter-platform" className="px-4 w-[144px]">
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
          <Label htmlFor="filter-year">年份</Label>
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger id="filter-year" className="px-4 w-[144px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-month">月份</Label>
          <Select value={String(month)} onValueChange={(v) => onMonthChange(Number(v))}>
            <SelectTrigger id="filter-month" className="px-4 w-[144px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-sku">平台商品编码</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="filter-sku"
              placeholder="输入 SKU 编号"
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
      </div>
    </Card>
  )
}
