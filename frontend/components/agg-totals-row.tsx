import { Card } from "@/components/ui/card"
import { formatNumber, formatCurrency } from "@/lib/format"
import type { AggRow } from "@/lib/types"

interface AggTotalsRowProps {
  data: AggRow[]
}

export function AggTotalsRow({ data }: AggTotalsRowProps) {
  const totals = data.reduce(
    (acc, row) => ({
      qty_sold_sum: acc.qty_sold_sum + row.qty_sold_sum,
      income_total_sum: acc.income_total_sum + row.income_total_sum,
      fee_platform_comm_sum: acc.fee_platform_comm_sum + row.fee_platform_comm_sum,
      fee_other_sum: acc.fee_other_sum + row.fee_other_sum,
      net_received_sum: acc.net_received_sum + row.net_received_sum,
    }),
    {
      qty_sold_sum: 0,
      income_total_sum: 0,
      fee_platform_comm_sum: 0,
      fee_other_sum: 0,
      net_received_sum: 0,
    },
  )

  return (
    <Card className="p-6 border-none shadow-none">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
        <div>
          <div className="text-sm text-muted-foreground mb-1">总销售数量</div>
          <div className="text-2xl font-bold tabular-nums">{formatNumber(totals.qty_sold_sum)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">总收入合计</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.income_total_sum)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">总平台佣金</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.fee_platform_comm_sum)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">总其他费用</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.fee_other_sum)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">总应到账金额</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.net_received_sum)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-1">一致性校验</div>
          <div className="text-sm font-medium tabular-nums">
            {Math.abs(
              totals.income_total_sum - totals.fee_platform_comm_sum - totals.fee_other_sum - totals.net_received_sum,
            ) < 0.01 ? (
              <span className="text-green-600">✓ 通过</span>
            ) : (
              <span className="text-red-600">
                ✗ 失败 (差异: {formatCurrency(
                  Math.abs(
                    totals.income_total_sum - totals.fee_platform_comm_sum - totals.fee_other_sum - totals.net_received_sum
                  )
                )})
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
