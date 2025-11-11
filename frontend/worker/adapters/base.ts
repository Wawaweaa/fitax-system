/**
 * 平台适配器基类 - 定义平台适配器的通用接口
 */
import { FactRow, Platform } from '../../lib/types';

/**
 * 解析选项接口
 */
export interface ParseOptions {
  platform: Platform;
  year: number;
  month: number;
  userId: string;
}

/**
 * 解析结果接口
 */
export interface ParseResult {
  factRows: FactRow[];
  warnings: string[];
}

/**
 * 平台适配器基类
 */
export abstract class PlatformAdapter {
  /**
   * 平台ID
   */
  abstract readonly platform: Platform;

  /**
   * 平台名称
   */
  abstract readonly name: string;

  /**
   * 平台描述
   */
  abstract readonly description: string;

  /**
   * 解析文件
   * @param settlementFilePath 结算文件路径
   * @param ordersFilePath 订单文件路径（可选）
   * @param options 解析选项
   */
  abstract parseFiles(
    settlementFilePath: string,
    ordersFilePath: string | null,
    options: ParseOptions
  ): Promise<ParseResult>;

  /**
   * 验证行数据
   * @param row 行数据
   * @returns 错误信息，如果无错误则返回空字符串
   */
  validateRow(row: FactRow): string {
    // 验证基本字段
    if (row.year === undefined || row.year === null) {
      return '缺少必要字段：年份';
    }

    if (row.month === undefined || row.month === null) {
      return '缺少必要字段：月份';
    }

    if (!row.order_id) {
      return '缺少必要字段：订单号';
    }

    if (!row.internal_sku) {
      return '缺少必要字段：商家编码';
    }

    if (!row.fin_code) {
      return '缺少必要字段：财务核算编码';
    }

    if (row.qty_sold === undefined || row.qty_sold === null) {
      return '缺少必要字段：销售数量';
    }

    if (row.recv_customer === undefined || row.recv_customer === null) {
      return '缺少必要字段：应收客户';
    }

    if (row.recv_platform === undefined || row.recv_platform === null) {
      return '缺少必要字段：应收平台';
    }

    if (row.extra_charge === undefined || row.extra_charge === null) {
      return '缺少必要字段：价外收费';
    }

    if (row.fee_platform_comm === undefined || row.fee_platform_comm === null) {
      return '缺少必要字段：平台佣金';
    }

    if (row.fee_affiliate === undefined || row.fee_affiliate === null) {
      return '缺少必要字段：分销佣金';
    }

    if (row.fee_other === undefined || row.fee_other === null) {
      return '缺少必要字段：其它费用';
    }

    if (row.net_received === undefined || row.net_received === null) {
      return '缺少必要字段：应到账金额';
    }

    // 验证数据一致性
    const calculatedNet = row.recv_customer + row.recv_platform + row.extra_charge - row.fee_platform_comm - row.fee_affiliate - row.fee_other;
    const roundedCalculatedNet = Math.round(calculatedNet * 100) / 100; // 四舍五入到2位小数
    const roundedNetReceived = Math.round(row.net_received * 100) / 100; // 四舍五入到2位小数

    if (Math.abs(roundedCalculatedNet - roundedNetReceived) > 0.02) {
      return `应到账金额计算不一致：应为${roundedCalculatedNet}，实际为${roundedNetReceived}`;
    }

    return '';
  }

  /**
   * 处理数值字段，确保返回数值
   * @param value 原始值
   * @param defaultValue 默认值（默认为0）
   * @returns 处理后的数值
   */
  protected parseNumber(value: any, defaultValue: number = 0): number {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'number') {
      return value;
    }

    // 尝试转换字符串为数字
    if (typeof value === 'string') {
      // 移除货币符号、千位分隔符等
      const cleanValue = value.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleanValue);
      return isNaN(parsed) ? defaultValue : parsed;
    }

    return defaultValue;
  }

  /**
   * 处理字符串字段，确保返回字符串
   * @param value 原始值
   * @param defaultValue 默认值（默认为空字符串）
   * @returns 处理后的字符串
   */
  protected parseString(value: any, defaultValue: string = ''): string {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return String(value);
  }
}