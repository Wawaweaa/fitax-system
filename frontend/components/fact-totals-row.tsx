import { Card } from "@/components/ui/card"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { FactRow } from "@/lib/types"

interface FactTotalsRowProps {
  data: FactRow[]
}

export function FactTotalsRow({ data }: FactTotalsRowProps) {
  const totals = data.reduce(
    (acc, row) => ({
      qty_sold: acc.qty_sold + row.qty_sold,
      recv_customer: acc.recv_customer + row.recv_customer,
      recv_platform: acc.recv_platform + row.recv_platform,
      extra_charge: acc.extra_charge + row.extra_charge,
      fee_platform_comm: acc.fee_platform_comm + row.fee_platform_comm,
      fee_affiliate: acc.fee_affiliate + row.fee_affiliate,
      fee_other: acc.fee_other + row.fee_other,
      net_received: acc.net_received + row.net_received,
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
    <Card className="p-3 bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">销售数量</span>
          <span className="text-sm font-semibold tabular-nums">{formatNumber(totals.qty_sold)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">应收客户</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.recv_customer)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">应收平台</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.recv_platform)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">收价外收费</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.extra_charge)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">收平台佣金</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.fee_platform_comm)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">扣分销佣金</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.fee_affiliate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">扣其它费用</span>
          <span className="text-sm font-semibold tabular-nums">{formatCurrency(totals.fee_other)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">应到账金额</span>
          <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(totals.net_received)}</span>
        </div>
      </div>
    </Card>
  )
}
