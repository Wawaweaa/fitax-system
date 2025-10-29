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
    <Card className="p-4 bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">合计：销售数量</p>
          <p className="text-lg font-semibold">{formatNumber(totals.qty_sold)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">应收客户</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.recv_customer)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">应收平台</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.recv_platform)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">价外收费</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.extra_charge)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">平台佣金</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.fee_platform_comm)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">分销佣金</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.fee_affiliate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">其它费用</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.fee_other)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">应到账金额</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(totals.net_received)}</p>
        </div>
      </div>
    </Card>
  )
}
