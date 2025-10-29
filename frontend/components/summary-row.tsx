import { Card } from "@/components/ui/card"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { DataRow } from "@/lib/types"

interface SummaryRowProps {
  data: DataRow[]
}

export function SummaryRow({ data }: SummaryRowProps) {
  const totals = data.reduce(
    (acc, row) => ({
      qty_sold: acc.qty_sold + row.qty_sold,
      sum_recv_customer: acc.sum_recv_customer + row.sum_recv_customer,
      sum_recv_platform: acc.sum_recv_platform + row.sum_recv_platform,
      sum_extra_charge: acc.sum_extra_charge + row.sum_extra_charge,
      sum_fee_platform_comm: acc.sum_fee_platform_comm + row.sum_fee_platform_comm,
      sum_fee_affiliate: acc.sum_fee_affiliate + row.sum_fee_affiliate,
      sum_fee_other: acc.sum_fee_other + row.sum_fee_other,
      sum_net_received: acc.sum_net_received + row.sum_net_received,
    }),
    {
      qty_sold: 0,
      sum_recv_customer: 0,
      sum_recv_platform: 0,
      sum_extra_charge: 0,
      sum_fee_platform_comm: 0,
      sum_fee_affiliate: 0,
      sum_fee_other: 0,
      sum_net_received: 0,
    },
  )

  return (
    <Card className="p-4 bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">总销售数量</p>
          <p className="text-lg font-semibold">{formatNumber(totals.qty_sold)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">总客户支付</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.sum_recv_customer)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">总平台收款</p>
          <p className="text-lg font-semibold">{formatCurrency(totals.sum_recv_platform)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">总佣金费用</p>
          <p className="text-lg font-semibold">
            {formatCurrency(totals.sum_fee_platform_comm + totals.sum_fee_affiliate + totals.sum_fee_other)}
          </p>
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-1">
          <p className="text-xs text-muted-foreground mb-1">总净收入</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(totals.sum_net_received)}</p>
        </div>
      </div>
    </Card>
  )
}
