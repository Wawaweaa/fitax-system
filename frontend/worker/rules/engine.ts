export type LineContext = {
  lineNo: number;
  lineCount: number;
};

export const helpers = {
  year(value: any): number | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.getFullYear();
  },
  month(value: any): number | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : (d.getMonth() + 1);
  },
  toNumber(v: any, def = 0): number {
    if (v === null || v === undefined || v === '') return def;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const s = v.replace(/[^\d.-]/g, '');
      const n = parseFloat(s);
      return isNaN(n) ? def : n;
    }
    return def;
  },
  round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  },
  roundUp(n: number, digits = 0): number {
    const base = Math.pow(10, digits);
    return Math.ceil(n * base) / base;
  },
  sum(vals: any[]): number {
    return vals.reduce((acc, v) => acc + helpers.toNumber(v, 0), 0);
  },
  leftUntilDash(s: any): string {
    if (s === null || s === undefined) return '';
    const str = String(s);
    const idx = str.indexOf('-');
    return idx > 0 ? str.slice(0, idx) : str;
  },
};

export type WechatVideoComputed = {
  year: number | null;
  month: number | null;
  order_id: string;
  line_count: number;
  line_no: number;
  internal_sku: string;
  fin_code: string;
  qty_sold: number;
  recv_customer: number;
  recv_platform: number;
  extra_charge: number;
  fee_platform_comm: number;
  fee_affiliate: number;
  fee_other: number;
  net_received: number;
};

