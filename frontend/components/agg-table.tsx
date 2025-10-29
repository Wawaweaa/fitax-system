"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber, formatCurrency } from "@/lib/format"
import type { AggRow } from "@/lib/types"

interface AggTableProps {
  data: AggRow[]
}

type SortField = keyof AggRow
type SortDirection = "asc" | "desc"

export function AggTable({ data }: AggTableProps) {
  const [sortField, setSortField] = useState<SortField>("internal_sku")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    const direction = sortDirection === "asc" ? 1 : -1

    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * direction
    }
    return ((aVal as number) - (bVal as number)) * direction
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-muted-foreground">↕</span>
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
  }

  return (
    <Card className="border-none shadow-none">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer sticky left-0 bg-background z-10"
                onClick={() => handleSort("internal_sku")}
              >
                商家编码
                <SortIcon field="internal_sku" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort("qty_sold_sum")}>
                销售数量
                <SortIcon field="qty_sold_sum" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort("income_total_sum")}>
                收入合计
                <SortIcon field="income_total_sum" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort("fee_platform_comm_sum")}>
                扣：平台佣金
                <SortIcon field="fee_platform_comm_sum" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort("fee_other_sum")}>
                扣：其他费用
                <SortIcon field="fee_other_sum" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort("net_received_sum")}>
                应到账金额
                <SortIcon field="net_received_sum" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium sticky left-0 bg-background">{row.internal_sku}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(row.qty_sold_sum)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{formatCurrency(row.income_total_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{row.income_total_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{formatCurrency(row.fee_platform_comm_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{row.fee_platform_comm_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{formatCurrency(row.fee_other_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{row.fee_other_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{formatCurrency(row.net_received_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{row.net_received_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
