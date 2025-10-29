"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PLATFORM_CONFIGS } from "@/lib/platform-config"
import type { Platform } from "@/lib/types"

interface PlatformSelectProps {
  value: Platform | undefined
  onChange: (value: Platform) => void
  highlighted?: boolean
}

export function PlatformSelect({ value, onChange, highlighted }: PlatformSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`w-full px-6 ${
          highlighted
            ? "bg-primary text-white hover:bg-primary/90 [&_svg]:!text-white [&_span]:text-white data-[placeholder]:text-white"
            : ""
        }`}
      >
        <SelectValue placeholder="选择平台" />
      </SelectTrigger>
      <SelectContent>
        {PLATFORM_CONFIGS.map((config) => (
          <SelectItem key={config.value} value={config.value}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
