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
import { formatCurrency, formatNumber } from "@/lib/format"
import type { DataRow } from "@/lib/types"

interface DataTableProps {
  data: DataRow[]
}

const COLUMN_LABELS: Record<keyof DataRow, string> = {
  internal_sku: "SKU 编号",
  qty_sold: "销售数量",
  sum_recv_customer: "客户支付",
  sum_recv_platform: "平台收款",
  sum_extra_charge: "额外费用",
  sum_fee_platform_comm: "平台佣金",
  sum_fee_affiliate: "联盟佣金",
  sum_fee_other: "其他费用",
  sum_net_received: "净收入",
}

export function DataTable({ data }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const columns: ColumnDef<DataRow>[] = [
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
      cell: ({ row }) => <div className="font-mono text-sm">{row.getValue("internal_sku")}</div>,
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
      accessorKey: "sum_recv_customer",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_recv_customer}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_recv_customer"))}</div>,
    },
    {
      accessorKey: "sum_recv_platform",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_recv_platform}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_recv_platform"))}</div>,
    },
    {
      accessorKey: "sum_extra_charge",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_extra_charge}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_extra_charge"))}</div>,
    },
    {
      accessorKey: "sum_fee_platform_comm",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_fee_platform_comm}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_fee_platform_comm"))}</div>,
    },
    {
      accessorKey: "sum_fee_affiliate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_fee_affiliate}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_fee_affiliate"))}</div>,
    },
    {
      accessorKey: "sum_fee_other",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_fee_other}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div className="text-right">{formatCurrency(row.getValue("sum_fee_other"))}</div>,
    },
    {
      accessorKey: "sum_net_received",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-8 px-2 w-full justify-end"
        >
          {COLUMN_LABELS.sum_net_received}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right font-semibold">{formatCurrency(row.getValue("sum_net_received"))}</div>
      ),
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
