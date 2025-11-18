import { helpers, LineContext, WechatVideoComputed } from './engine';

export const RULE_VERSION = 'wxv-2025-11-06';

function n(v: any): number { return helpers.toNumber(v, 0); }

function sumAjToAm(raw: any): number {
  return helpers.sum([
    raw['商品优惠'], // AJ
    raw['跨店优惠'], // AK
    raw['商品改价'], // AL
    raw['积分抵扣'], // AM
  ]);
}

function pickSku(raw: any): string {
  const candidates = [
    'SKU编码(自定义)',
    '商品编码(自定义)',
    '商品编码(平台)',
    '平台商品编码',
    '商品编码'
  ];
  for (const k of candidates) {
    const v = raw[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

export function computeWechatVideo(raw: any, ctx: LineContext): WechatVideoComputed {
  // Base inputs from raw
  const orderId = String(raw['订单号'] ?? '').trim();
  const sku = pickSku(raw);
  const settleTime = raw['订单完成结算时间'];

  const BI = n(raw['商品价格']);
  const BK = n(raw['商品实际价格(总共)']);
  const BN = n(raw['商品平台券优惠']);
  const BT = n(raw['商品已退款金额']);
  const BM = n(raw['商品数量']);

  const AI = n(raw['订单运费']);
  const AS = n(raw['技术服务费']);
  const AT = n(raw['技术服务费（将以人气卡形式返还）']);
  const AU = n(raw['运费险预计投保费用']);
  const BA = n(raw['带货费用']);

  // H: qty_sold = ROUNDUP((BK+BN-BT)/BI, 0)
  const qty_sold = helpers.roundUp(BI === 0 ? 0 : ((BK + BN - BT) / BI), 0);

  // I: recv_customer = IF(H=0,0, BI*BM - BT)
  const recv_customer = qty_sold === 0 ? 0 : helpers.round2(BI * BM - BT);

  // J: recv_platform = IF(AND(H>0, E=1), SUM(AJ:AM), -SUM(AJ:AM))
  const aj2am = sumAjToAm(raw);
  const recv_platform = (qty_sold > 0 && ctx.lineNo === 1) ? helpers.round2(aj2am) : helpers.round2(-aj2am);

  // K: extra_charge = IF(E=1, AI, 0)
  const extra_charge = ctx.lineNo === 1 ? helpers.round2(AI) : 0;

  // L: fee_platform_comm = IF(E=1, SUM(AS:AT), 0)
  const fee_platform_comm = ctx.lineNo === 1 ? helpers.round2(AS + AT) : 0;

  // M: fee_affiliate = IF(E=1, BA, 0)
  const fee_affiliate = ctx.lineNo === 1 ? helpers.round2(BA) : 0;

  // N: fee_other = IF(E=1, AU, 0)
  const fee_other = ctx.lineNo === 1 ? helpers.round2(AU) : 0;

  // O: net_received = I + J + K - L - M - N
  const net_received = helpers.round2(
    recv_customer + recv_platform + extra_charge - fee_platform_comm - fee_affiliate - fee_other
  );

  return {
    // 按你的口径使用请求参数中的 year/month，规则层不返回，留给适配器回填
    year: null,
    month: null,
    order_id: orderId,
    line_count: ctx.lineCount,
    line_no: ctx.lineNo,
    internal_sku: sku,
    fin_code: helpers.leftUntilDash(sku),
    qty_sold,
    recv_customer,
    recv_platform,
    extra_charge,
    fee_platform_comm,
    fee_affiliate,
    fee_other,
    net_received,
  };
}
