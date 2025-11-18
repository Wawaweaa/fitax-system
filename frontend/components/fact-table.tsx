"use client"

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
// 自定义更紧凑的排序图标，替代 ArrowUpDown
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FactRow } from "@/lib/types"

interface FactTableProps {
  data: FactRow[]
  platform: string
}

function SmallSortIcon({ dir, className }: { dir: false | "asc" | "desc"; className?: string }) {
  const topOpacity = dir === "desc" ? 0.3 : dir === "asc" ? 1 : 0.6
  const bottomOpacity = dir === "asc" ? 0.3 : dir === "desc" ? 1 : 0.6
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("inline-block h-4 w-4 align-middle", className)}
    >
      <path d="M6 2 L3.2 5.8 H8.8 Z" fill="currentColor" fillOpacity={topOpacity} />
      <path d="M6 10 L8.8 6.2 H3.2 Z" fill="currentColor" fillOpacity={bottomOpacity} />
    </svg>
  )
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
  extra_charge: "收价外收费",
  fee_platform_comm: "扣平台佣金",
  fee_affiliate: "扣分销佣金",
  fee_other: "扣其它费用",
  net_received: "应到账金额",
}

export function FactTable({ data, platform }: FactTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  // Check if platform supports line info
  const hasLineInfo = platform === "wechat_video"

  // 列对齐映射：集中控制各列内容的水平对齐
  const COL_ALIGN: Record<string, 'left' | 'center' | 'right'> = {
    year: 'center',
    month: 'center',
    order_id: 'center',
    line_count: 'center',
    line_no: 'center',
    internal_sku: 'left',
    fin_code: 'center',
    qty_sold: 'right',
    recv_customer: 'right',
    recv_platform: 'right',
    extra_charge: 'right',
    fee_platform_comm: 'right',
    fee_affiliate: 'right',
    fee_other: 'right',
    net_received: 'right',
  }
  const alignClass = (id: string) =>
    COL_ALIGN[id] === 'right' ? 'text-right' : COL_ALIGN[id] === 'left' ? 'text-left' : 'text-center'

  const columns: ColumnDef<FactRow>[] = [
    {
      accessorKey: "year",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center">{COLUMN_LABELS.year}</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => <div className="text-xs">{row.getValue("year")}</div>,
    },
    {
      accessorKey: "month",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center">{COLUMN_LABELS.month}</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => <div className="text-xs">{row.getValue("month")}</div>,
    },
    {
      accessorKey: "order_id",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-2 text-xs"
          >
            <span className="block w-full text-center">{COLUMN_LABELS.order_id}</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => <div className="text-xs">{row.getValue("order_id")}</div>,
    },
    {
      accessorKey: "line_count",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">订单<br />行数</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("line_count") as number | null
        return value === null ? (
          <div className="text-center text-muted-foreground" aria-label="留空（该平台暂不计算订单行数）">
            —
          </div>
        ) : (
          <div className="text-xs">{value}</div>
        )
      },
    },
    {
      accessorKey: "line_no",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">订单<br />序位</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("line_no") as number | null
        return value === null ? (
          <div className="text-center text-muted-foreground" aria-label="留空（该平台暂不计算订单序位）">
            —
          </div>
        ) : (
          <div className="text-xs">{value}</div>
        )
      },
    },
    {
      accessorKey: "internal_sku",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-2 text-xs hover:bg-transparent"
          >
            <span className="block w-full text-center">{COLUMN_LABELS.internal_sku}</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-xs">{row.getValue("internal_sku")}</div>
      ),
    },
    {
      accessorKey: "fin_code",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">财务核算<br />编码</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => <div className="text-xs">{row.getValue("fin_code")}</div>,
    },
    {
      accessorKey: "qty_sold",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">销售<br />数量</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => <div className="text-xs">{formatNumber(row.getValue("qty_sold"))}</div>,
    },
    {
      accessorKey: "recv_customer",
      header: ({ column }) => (
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">应收<br />客户</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("recv_customer") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-12 px-1 text-xs"
          >
            <span className="block text-center leading-tight whitespace-normal">应收<br />平台</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("recv_platform") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center leading-tight whitespace-normal">收价外<br />收费</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("extra_charge") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center leading-tight whitespace-normal">扣平台<br />佣金</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_platform_comm") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center leading-tight whitespace-normal">扣分销<br />佣金</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_affiliate") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center leading-tight whitespace-normal">扣其他<br />费用</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("fee_other") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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
        <div className="relative w-full">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="w-full h-8 px-1 text-xs"
          >
            <span className="block w-full text-center leading-tight whitespace-normal">应到账<br />金额</span>
          </Button>
          <SmallSortIcon
            dir={column.getIsSorted() as any}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-150",
              column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-60"
            )}
          />
        </div>
      ),
      cell: ({ row }) => {
        const value = row.getValue("net_received") as number
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs">{formatCurrency(value)}</span>
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

  // 汇总行（行级）：在表头与表体之间插入一行，展示关键字段聚合
  const factTotals = data.reduce(
    (acc, row) => ({
      qty_sold: acc.qty_sold + (row.qty_sold || 0),
      recv_customer: acc.recv_customer + (row.recv_customer || 0),
      recv_platform: acc.recv_platform + (row.recv_platform || 0),
      extra_charge: acc.extra_charge + (row.extra_charge || 0),
      fee_platform_comm: acc.fee_platform_comm + (row.fee_platform_comm || 0),
      fee_affiliate: acc.fee_affiliate + (row.fee_affiliate || 0),
      fee_other: acc.fee_other + (row.fee_other || 0),
      net_received: acc.net_received + (row.net_received || 0),
    }),
    {
      qty_sold: 0,
      recv_customer: 0,
      recv_platform: 0,
      extra_charge: 0,
      fee_platform_comm: 0,
      fee_affiliate: 0,
      fee_other: 0,
      net_received: 0,
    },
  )

  return (
    <div className="rounded-md border overflow-auto" style={{ height: "610px" }}>
      <Table>
        <TableHeader className="bg-background z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "sticky top-0 z-20 bg-muted/50 px-0 pl-1 group",
                    header.column.id === "year" ? "min-w-[54px]" : "",
                    header.column.id === "month" ? "min-w-[54px]" : "",
                    (header.column.id === "line_count" || header.column.id === "line_no") ? "min-w-[56px]" : "",
                    header.column.id === "order_id" ? "min-w-[180px]" : "",
                    header.column.id === "internal_sku" ? "min-w-[120px]" : "",
                    header.column.id === "fin_code" ? "min-w-[100px]" : "",
                    header.column.id === "qty_sold" ? "min-w-[60px]" : "",
                    header.column.id === "recv_customer" ? "min-w-[80px]" : "",
                    header.column.id === "recv_platform" ? "min-w-[70px]" : "",
                    header.column.id === "extra_charge" ? "min-w-[70px]" : "",
                    header.column.id === "fee_platform_comm" ? "min-w-[70px]" : "",
                    header.column.id === "fee_affiliate" ? "min-w-[70px]" : "",
                    header.column.id === "fee_other" ? "min-w-[70px]" : "",
                    header.column.id === "net_received" ? "min-w-[100px]" : "",
                    (header.column.id === "line_count" || header.column.id === "line_no" ||
                     header.column.id === "fin_code" || header.column.id === "qty_sold" ||
                     header.column.id === "recv_customer" || header.column.id === "recv_platform")
                      ? "whitespace-normal break-keep text-center"
                       : "",
                  )}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
          {/* 汇总行（非数据行，不参与排序） */}
          <TableRow className="bg-muted/15">
            {table.getHeaderGroups()[0]?.headers.map((h) => {
              const id = h.column.id
              let val: string | number = ''
              switch (id) {
                case 'qty_sold':
                  val = formatNumber(factTotals.qty_sold)
                  break
                case 'recv_customer':
                  val = formatCurrency(factTotals.recv_customer)
                  break
                case 'recv_platform':
                  val = formatCurrency(factTotals.recv_platform)
                  break
                case 'extra_charge':
                  val = formatCurrency(factTotals.extra_charge)
                  break
                case 'fee_platform_comm':
                  val = formatCurrency(factTotals.fee_platform_comm)
                  break
                case 'fee_affiliate':
                  val = formatCurrency(factTotals.fee_affiliate)
                  break
                case 'fee_other':
                  val = formatCurrency(factTotals.fee_other)
                  break
                case 'net_received':
                  val = formatCurrency(factTotals.net_received)
                  break
                default:
                  val = ''
              }
              return (
                <TableHead key={`total-${id}`} className={cn('sticky top-8 z-20 text-xs tabular-nums font-semibold italic', alignClass(id))}>
                  {val}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={alignClass(cell.column.id)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
