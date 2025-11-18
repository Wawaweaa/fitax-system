"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber, formatCurrency } from "@/lib/format"
import type { AggRow } from "@/lib/types"

interface AggTableProps {
  data: AggRow[]
}


function SmallSortIcon({ dir, className }: { dir: false | "asc" | "desc"; className?: string }) {
  const topOpacity = dir === "desc" ? 0.3 : dir === "asc" ? 1 : 0.6;
  const bottomOpacity = dir === "asc" ? 0.3 : dir === "desc" ? 1 : 0.6;
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("inline-block h-4 w-4 align-middle", className)}
    >
      <path d="M6 2 L3.2 5.8 H8.8 Z" fill="currentColor" fillOpacity={topOpacity} />
      <path d="M6 10 L8.8 6.2 H3.2 Z" fill="currentColor" fillOpacity={bottomOpacity} />
    </svg>
  );
}

type SortField = keyof AggRow | null
type SortDirection = "asc" | "desc"

export function AggTable({ data }: AggTableProps) {
  const [sortField, setSortField] = useState<SortField>(null)
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
    if (!sortField) return 0;
    const aVal = a[sortField];
    const bVal = b[sortField];
    const direction = sortDirection === "asc" ? 1 : -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * direction;
    }
    return ((aVal as number) - (bVal as number)) * direction;
  })

    const SortIcon = ({ field }: { field: SortField }) => {
    const dir: false | "asc" | "desc" = sortField === field ? sortDirection : false;
    return <SmallSortIcon dir={dir} className={"ml-1"} />;
  };

  return (
    <Card className="rounded-md border shadow-none py-0">
      <Table>
                    <TableHeader>
            <TableRow>
              <TableHead className="bg-muted/50 px-0 pl-1 group">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("internal_sku")}
                    className="w-full h-12 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">商家编码</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "internal_sku" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "internal_sku" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/50 px-0 pl-1 group text-right">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("qty_sold_sum")}
                    className="w-full h-8 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">销售数量</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "qty_sold_sum" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "qty_sold_sum" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/50 px-0 pl-1 group text-right">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("income_total_sum")}
                    className="w-full h-8 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">收入合计(含税)</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "income_total_sum" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "income_total_sum" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/50 px-0 pl-1 group text-right">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("fee_platform_comm_sum")}
                    className="w-full h-8 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">扣平台佣金</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "fee_platform_comm_sum" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "fee_platform_comm_sum" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/50 px-0 pl-1 group text-right">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("fee_other_sum")}
                    className="w-full h-8 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">扣其它费用</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "fee_other_sum" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "fee_other_sum" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/50 px-0 pl-1 group text-right">
                <div className="relative w-full">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("net_received_sum")}
                    className="w-full h-8 px-2 text-xs hover:bg-transparent"
                  >
                    <span className="block w-full text-center">应到账金额</span>
                  </Button>
                  <SmallSortIcon
                    dir={sortField === "net_received_sum" ? sortDirection : false}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
                      sortField === "net_received_sum" ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                  />
                </div>
              </TableHead>
            </TableRow>
            {/* 汇总行（聚合视图） */}
            <TableRow className="bg-muted/30">
              <TableHead className="bg-muted/15" />
              <TableHead className="text-right text-xs tabular-nums font-semibold italic">
                {formatNumber(data.reduce((s, r) => s + (r.qty_sold_sum || 0), 0))}
              </TableHead>
              <TableHead className="text-right text-xs tabular-nums font-semibold italic">
                {formatCurrency(data.reduce((s, r) => s + (r.income_total_sum || 0), 0))}
              </TableHead>
              <TableHead className="text-right text-xs tabular-nums font-semibold italic">
                {formatCurrency(data.reduce((s, r) => s + (r.fee_platform_comm_sum || 0), 0))}
              </TableHead>
              <TableHead className="text-right text-xs tabular-nums font-semibold italic">
                {formatCurrency(data.reduce((s, r) => s + (r.fee_other_sum || 0), 0))}
              </TableHead>
              <TableHead className="text-right text-xs tabular-nums font-semibold italic">
                {formatCurrency(data.reduce((s, r) => s + (r.net_received_sum || 0), 0))}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, index) => (
              <TableRow key={index}>
                <TableCell className="bg-background text-xs">{row.internal_sku}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{formatNumber(row.qty_sold_sum)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-xs">{formatCurrency(row.income_total_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{row.income_total_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-xs">{formatCurrency(row.fee_platform_comm_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{row.fee_platform_comm_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-xs">{formatCurrency(row.fee_other_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{row.fee_other_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-xs">{formatCurrency(row.net_received_sum)}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{row.net_received_sum}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </Card>
  )
}
