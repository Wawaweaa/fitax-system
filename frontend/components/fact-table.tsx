"use client"

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowUpDown } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { FactRow } from "@/lib/types"

interface FactTableProps {
  data: FactRow[]
  platform: string
}

const COLUMN_LABELS: Record<keyof FactRow, string> = {
  year: "年",
  month: "月",
  order_id: "订单号",
  line_count: "订单行数",
  line_no: "订单序位",
  internal_sku: "商家编码",
  fin_code: "财务核算编码",
  qty_sold: "销售数量",
  recv_customer: "应收客户",
  recv_platform: "应收平台",
  extra_charge: "收：价外收费",
  fee_platform_comm: "扣：平台佣金",
  fee_affiliate: "扣：分销佣金",
  fee_other: "扣：其它费用",
  net_received: "应到账金额",
}

export function FactTable({ data, platform }: FactTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Check if platform supports line info
  const hasLineInfo = platform === "wechat_video"

  const columns: ColumnDef<FactRow>[] = [
    {
      accessorKey: "year",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.year}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-sm">{row.getValue("year")}</div>,
    },
    {
      accessorKey: "month",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.month}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-sm">{row.getValue("month")}</div>,
    },
    {
      accessorKey: "order_id",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.order_id}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="font-mono text-xs">{row.getValue("order_id")}</div>,
    },
    {
      accessorKey: "line_count",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.line_count}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("line_count") as number | null
        return value === null ? (
          <div className="text-center text-muted-foreground" aria-label="留空（该平台暂不计算订单行数）">
            —
          </div>
        ) : (
          <div className="text-center">{value}</div>
        )
      },
    },
    {
      accessorKey: "line_no",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.line_no}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("line_no") as number | null
        return value === null ? (
          <div className="text-center text-muted-foreground" aria-label="留空（该平台暂不计算订单序位）">
            —
          </div>
        ) : (
          <div className="text-center">{value}</div>
        )
      },
    },
    {
      accessorKey: "internal_sku",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.internal_sku}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-mono text-sm sticky left-0 bg-background">{row.getValue("internal_sku")}</div>
      ),
    },
    {
      accessorKey: "fin_code",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2"
        >
          {COLUMN_LABELS.fin_code}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="font-mono text-xs">{row.getValue("fin_code")}</div>,
    },
    {
      accessorKey: "qty_sold",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.qty_sold}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right font-medium">{formatNumber(row.getValue("qty_sold"))}</div>,
    },
    {
      accessorKey: "recv_customer",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.recv_customer}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("recv_customer") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "recv_platform",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.recv_platform}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("recv_platform") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "extra_charge",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.extra_charge}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("extra_charge") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "fee_platform_comm",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.fee_platform_comm}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_platform_comm") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "fee_affiliate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.fee_affiliate}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_affiliate") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "fee_other",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.fee_other}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_other") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      accessorKey: "net_received",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.net_received}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue("net_received") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right font-semibold">{formatCurrency(value)}</div>
              </TooltipTrigger>
              <TooltipContent>
                <p>原始值: {value}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 53,
    overscan: 10,
  })

  return (
    <div ref={tableContainerRef} className="rounded-md border overflow-auto" style={{ height: "600px" }}>
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="bg-muted/50">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <TableRow
                key={row.id}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
