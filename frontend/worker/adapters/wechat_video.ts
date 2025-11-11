/**
 * 微信视频号平台适配器 - 处理微信视频号平台的数据文件
 */
import fs from 'fs/promises';
import path from 'path';
import csvParser from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { FactRow, Platform } from '../../lib/types';
import { computeWechatVideo, RULE_VERSION } from '../rules/wechat_video.rules';
import { helpers } from '../rules/engine';
import { PlatformAdapter, ParseOptions, ParseResult } from './base';
import { generateRowKey, generateRowHash } from '../../lib/datasets';

/**
 * 微信视频号平台适配器
 */
export class WechatVideoAdapter extends PlatformAdapter {
  /**
   * 平台ID
   */
  readonly platform: Platform = 'wechat_video';

  /**
   * 平台名称
   */
  readonly name: string = '微信视频号';

  /**
   * 平台描述
   */
  readonly description: string = '微信视频号电商平台';

  /**
   * 解析文件
   * @param settlementFilePath 结算文件路径
   * @param ordersFilePath 订单文件路径（可选）
   * @param options 解析选项
   */
  async parseFiles(
    settlementFilePath: string,
    ordersFilePath: string | null,
    options: ParseOptions
  ): Promise<ParseResult> {
    // 初始化结果
    const result: ParseResult = {
      factRows: [],
      warnings: []
    };

    // 检查文件后缀名
    const ext = path.extname(settlementFilePath).toLowerCase();

    if (ext === '.csv') {
      // 解析CSV文件
      return this.parseCSV(settlementFilePath, options);
    } else if (ext === '.xlsx' || ext === '.xls') {
      // 解析Excel文件
      return this.parseExcel(settlementFilePath, options);
    } else {
      throw new Error(`不支持的文件格式: ${ext}，微信视频号平台支持CSV和Excel格式`);
    }
  }

  /**
   * 解析CSV文件
   * @param filePath 文件路径
   * @param options 解析选项
   */
  private async parseCSV(filePath: string, options: ParseOptions): Promise<ParseResult> {
    const result: ParseResult = {
      factRows: [],
      warnings: []
    };

    // 读取文件
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const results: any[] = [];

    // 创建CSV解析器并处理数据
    await new Promise<void>((resolve, reject) => {
      const parser = csvParser();

      parser.on('data', (data: any) => results.push(data));
      parser.on('error', (err: Error) => {
        result.warnings.push(`CSV解析错误: ${err.message}`);
        reject(err);
      });
      parser.on('end', () => resolve());

      // 处理CSV数据
      Readable.from(fileContent).pipe(parser);
    });

    const rows = results;

    // 检查文件是否为空
    if (rows.length === 0) {
      result.warnings.push('文件为空，没有数据可处理');
      return result;
    }

    // 解析行（配置化计算 + 不删行 + source_row）
    let idx = 0;
    const orderGroups: Record<string, number> = {};
    const orderCounts: Record<string, number> = {};
    // 预先统计每个订单的总行数（line_count）
    for (const r of rows as any[]) {
      const oid = String(r['订单号'] ?? '');
      orderCounts[oid] = (orderCounts[oid] || 0) + 1;
    }
    // 逐行计算
    for (const row of rows as any[]) {
      idx++;
      const orderId = String(row['订单号'] ?? '');
      orderGroups[orderId] = (orderGroups[orderId] || 0) + 1;
      const ctx = { lineNo: orderGroups[orderId], lineCount: orderCounts[orderId] || 1 };
      try {
        const c = computeWechatVideo(row, ctx);
        const factRow: FactRow = {
          year: options.year,
          month: options.month,
          order_id: c.order_id,
          line_count: c.line_count,
          line_no: c.line_no,
          internal_sku: c.internal_sku,
          fin_code: c.fin_code,
          qty_sold: c.qty_sold,
          recv_customer: c.recv_customer,
          recv_platform: c.recv_platform,
          extra_charge: c.extra_charge,
          fee_platform_comm: c.fee_platform_comm,
          fee_affiliate: c.fee_affiliate,
          fee_other: c.fee_other,
          net_received: c.net_received,
          // 元数据
          source_file: path.basename(filePath),
          source_line: idx,
          // 可扩展：规则版本（可作为标注列写入 Parquet 时合并）
        } as any;

        // 只标注不拦截
        const warn = this.validateRow(factRow);
        if (warn) {
          result.warnings.push(`行${idx}: ${warn}`);
          (factRow as any).validation_status = 'warn';
          (factRow as any).validation_warnings = [warn];
        } else {
          (factRow as any).validation_status = 'ok';
        }
        (factRow as any).rule_version = RULE_VERSION;
        // 诊断日志：关键行（前5行，或特定订单）
        if (idx <= 5 || c.order_id === '3729946591347487488') {
          console.log('[wechat-rule] CSV row', {
            idx,
            order_id: c.order_id,
            line_no: c.line_no,
            line_count: c.line_count,
            year: factRow.year,
            month: factRow.month,
            internal_sku: c.internal_sku,
            fin_code: c.fin_code,
            qty_sold: c.qty_sold
          });
        }

        result.factRows.push(factRow);
      } catch (err: any) {
        result.warnings.push(`行${idx}: 解析错误 - ${err.message || err}`);
        // 仍然保留原始行的最小信息，避免删行（可选）
        const fallback: FactRow = {
          year: options.year,
          month: options.month,
          order_id: orderId,
          line_count: orderCounts[orderId] || 1,
          line_no: orderGroups[orderId],
          internal_sku: String(row['SKU编码(自定义)'] ?? ''),
          fin_code: helpers.leftUntilDash(String(row['SKU编码(自定义)'] ?? '')),
          qty_sold: 0,
          recv_customer: 0,
          recv_platform: 0,
          extra_charge: 0,
          fee_platform_comm: 0,
          fee_affiliate: 0,
          fee_other: 0,
          net_received: 0,
          source_file: path.basename(filePath),
          source_line: idx,
        } as any;
        (fallback as any).validation_status = 'error';
        (fallback as any).validation_warnings = [String(err?.message || err)];
        (fallback as any).rule_version = RULE_VERSION;
        if (idx <= 5 || orderId === '3729946591347487488') {
          console.log('[wechat-rule] CSV fallback', { idx, order_id: orderId, warn: fallback.validation_warnings });
        }
        result.factRows.push(fallback);
      }
    }

    return result;
  }

  /**
   * 解析Excel文件
   * @param filePath 文件路径
   * @param options 解析选项
   */
  private async parseExcel(filePath: string, options: ParseOptions): Promise<ParseResult> {
    const result: ParseResult = {
      factRows: [],
      warnings: []
    };

    // 读取文件
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer);

    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 将工作表转换为JSON
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log('[wechat-debug] raw settlement rows count', { year: options.year, month: options.month, count: rows.length, file: path.basename(filePath) });
    // 打印前5行核心字段，便于定位（不含敏感金额）
    try {
      const sample = (rows as any[]).slice(0, 5).map((r, i) => ({
        idx: i + 1,
        order_id: String(r['订单号'] ?? ''),
        line_no: r['行号'] ?? r['商品行号'] ?? r['Line No.'],
        line_count: r['商品行数'] ?? r['行数'] ?? r['Line Count'],
        sku: r['商品编码'] ?? r['商家编码'] ?? r['SKU编码(自定义)'],
      }));
      console.log('[wechat-debug] raw sample', sample);
    } catch {}

    // 检查文件是否为空
    if (rows.length === 0) {
      result.warnings.push('文件为空，没有数据可处理');
      return result;
    }

    // 解析行（Excel 分支同 CSV：配置化 + 不删行 + source_row）
    let lineNumber = 1;
    const orderCounts: Record<string, number> = {};
    for (const r of rows as any[]) {
      const oid = String(r['订单号'] ?? '');
      orderCounts[oid] = (orderCounts[oid] || 0) + 1;
    }
    const orderGroups: Record<string, number> = {};
    for (const row of rows as any[]) {
      lineNumber++;
      const oid = String(row['订单号'] ?? '');
      orderGroups[oid] = (orderGroups[oid] || 0) + 1;
      const ctx = { lineNo: orderGroups[oid], lineCount: orderCounts[oid] || 1 };
      try {
        const c = computeWechatVideo(row, ctx);
        const factRow: FactRow = {
          year: options.year,
          month: options.month,
          order_id: c.order_id,
          line_count: c.line_count,
          line_no: c.line_no,
          internal_sku: c.internal_sku,
          fin_code: c.fin_code,
          qty_sold: c.qty_sold,
          recv_customer: c.recv_customer,
          recv_platform: c.recv_platform,
          extra_charge: c.extra_charge,
          fee_platform_comm: c.fee_platform_comm,
          fee_affiliate: c.fee_affiliate,
          fee_other: c.fee_other,
          net_received: c.net_received,
          source_file: path.basename(filePath),
          source_line: lineNumber,
        } as any;
        const warn = this.validateRow(factRow);
        if (warn) {
          result.warnings.push(`行${lineNumber}: ${warn}`);
          (factRow as any).validation_status = 'warn';
          (factRow as any).validation_warnings = [warn];
        } else {
          (factRow as any).validation_status = 'ok';
        }
        (factRow as any).rule_version = RULE_VERSION;
        if (lineNumber <= 5) {
          console.log('[wechat-debug] fact row sample', {
            idx: lineNumber,
            order_id: factRow.order_id,
            line_no: factRow.line_no,
            line_count: factRow.line_count,
            year: factRow.year,
            month: factRow.month,
            internal_sku: factRow.internal_sku,
            fin_code: factRow.fin_code,
            qty_sold: factRow.qty_sold,
            net_received: factRow.net_received,
          });
        }
        result.factRows.push(factRow);
      } catch (err: any) {
        result.warnings.push(`行${lineNumber}: 解析错误 - ${err.message || err}`);
        const fallback: FactRow = {
          year: options.year,
          month: options.month,
          order_id: oid,
          line_count: orderCounts[oid] || 1,
          line_no: orderGroups[oid],
          internal_sku: String(row['SKU编码(自定义)'] ?? ''),
          fin_code: helpers.leftUntilDash(String(row['SKU编码(自定义)'] ?? '')),
          qty_sold: 0,
          recv_customer: 0,
          recv_platform: 0,
          extra_charge: 0,
          fee_platform_comm: 0,
          fee_affiliate: 0,
          fee_other: 0,
          net_received: 0,
          source_file: path.basename(filePath),
          source_line: lineNumber,
        } as any;
        (fallback as any).validation_status = 'error';
        (fallback as any).validation_warnings = [String(err?.message || err)];
        (fallback as any).rule_version = RULE_VERSION;
        if (lineNumber <= 5 || oid === '3729946591347487488') {
          console.log('[wechat-rule] XLSX fallback', { idx: lineNumber, order_id: oid, warn: (fallback as any).validation_warnings });
        }
        result.factRows.push(fallback);
      }
    }

    // 聚合统计：行号为0的行与非0行
    try {
      const zeroLineCount = result.factRows.filter((r: any) => (Number(r.line_no) === 0) || (Number(r.line_count) === 0)).length;
      const nonZeroLineCount = result.factRows.length - zeroLineCount;
      console.log('[wechat-debug] final stats', {
        year: options.year,
        month: options.month,
        length: result.factRows.length,
        zeroLineCount,
        nonZeroLineCount,
      });
    } catch {}
    console.log('[wechat-debug] final factRows length', { year: options.year, month: options.month, length: result.factRows.length });
    return result;
  }

  /**
   * 映射原始行数据到FactRow
   * @param row 原始行数据
   * @param options 解析选项
   * @param sourceFile 源文件
   * @param sourceLine 源文件行号
   */
  private mapRowToFactRow(
    row: any,
    options: ParseOptions,
    sourceFile: string,
    sourceLine: number
  ): FactRow {
    // 微信视频号字段映射 - 适配真实的文件格式
    // 尝试获取各个字段（处理字段名可能的变体）
    const orderId = this.getFieldValue(row, ['订单号', 'Order No.', 'Order Number', 'OrderId']);
    const lineCount = this.getFieldValue(row, ['商品行数', '行数', 'Line Count', '商品总行数']);
    const lineNo = this.getFieldValue(row, ['行号', '商品行号', 'Line No.', 'Line Number']);
    const skuCode = this.getFieldValue(row, [
      '商品编码', '商家编码', 'Product Code', 'SKU', 'SKU编码(自定义)',
      '商品ID', '商品编号', '货号', '自定义编码'
    ]);
    const finCode = this.getFieldValue(row, [
      '财务编码', 'Financial Code', 'Fin Code', '财务代码',
      '财务核算编码', '核算编码'
    ]) || skuCode;

    // 获取数量（按原始值保留，不做三段式映射）
    const rawQuantity = this.getFieldValue(row, [
      '数量', 'Quantity', 'Qty', '商品数量', '售出数量', '销售数量'
    ]);
    const parsedQty = this.parseNumber(rawQuantity);

    // 金额字段
    const buyerPayment = this.getFieldValue(row, [
      '实收金额', '应收买家', 'Actual Received', '订单实际收款金额',
      '商品实际价格(总共)', '买家支付金额', '用户支付金额'
    ]);
    const platformPayment = this.getFieldValue(row, [
      '平台补贴', '应收平台', 'Platform Subsidy', '平台补贴金额',
      '平台承担金额', '补贴金额'
    ]);
    const additionalFee = this.getFieldValue(row, [
      '附加费用', '价外收费', 'Additional Fee', '运费',
      '物流费', '附加收费'
    ]);
    const platformComm = this.getFieldValue(row, [
      '平台佣金', 'Platform Commission', '技术服务费',
      '佣金', '平台服务费'
    ]);
    const distributionFee = this.getFieldValue(row, [
      '分销服务费', '分销佣金', 'Distribution Fee', '带货费用',
      '分销费', '分销商费用'
    ]);
    const otherFee = this.getFieldValue(row, [
      '其他费用', 'Other Fee', '运费险预计投保费用', '订单运费',
      '杂费', '其它费用', '额外费用'
    ]);
    const settlement = this.getFieldValue(row, [
      '结算金额', 'Settlement Amount', '商品已退款金额', '净收入',
      '到账金额', '实际结算金额'
    ]);

    // 解析所有字段值
    const parsedOrderId = this.parseString(orderId);
    const parsedSkuCode = this.parseString(skuCode);
    if (!parsedSkuCode) {
      throw new Error('SKU编码不能为空');
    }

    const parsedLineNo = this.parseNumber(lineNo, undefined);
    const parsedRecvCustomer = this.parseNumber(buyerPayment);
    const parsedRecvPlatform = this.parseNumber(platformPayment);
    const parsedExtraCharge = this.parseNumber(additionalFee);
    const parsedPlatformComm = this.parseNumber(platformComm);
    const parsedAffiliateFee = this.parseNumber(distributionFee);
    const parsedOtherFee = this.parseNumber(otherFee);
    const parsedNetReceived = this.parseNumber(settlement);

    // 校验金额恒等式
    const calculatedNetReceived = parsedRecvCustomer + parsedRecvPlatform + parsedExtraCharge -
                                parsedPlatformComm - parsedAffiliateFee - parsedOtherFee;
    const roundedCalculated = Math.round(calculatedNetReceived * 100) / 100;
    const roundedNet = Math.round(parsedNetReceived * 100) / 100;

    // [策略 A] 处理 net_received 为 0 或不一致的情况
    let adjustedNetReceived = roundedNet;
    let amountWarning: string | null = null;

    if (roundedNet === 0 && roundedCalculated !== 0) {
      // 原始 net_received 为 0，使用计算值，并记录 warning
      adjustedNetReceived = roundedCalculated;
      amountWarning = `net_received 原值为 0，已自动调整为计算值 ${roundedCalculated}`;
    } else if (Math.abs(roundedCalculated - roundedNet) > 0.02 && roundedNet !== 0) {
      // net_received 有值但与计算值偏差过大（> 0.02），记录 warning 但保留原始值
      amountWarning = `应到账金额计算不一致：应为${roundedCalculated}，实际为${roundedNet}`;
    }
    // 如果偏差 ≤ 0.02 或都为 0，则认为一致，无需 warning

    // 创建FactRow对象
    const factRow: FactRow = {
      // 标准字段 (A-O 15列)
      year: options.year,                        // A: 结算年
      month: options.month,                      // B: 结算月
      order_id: parsedOrderId,                   // C: 订单号
      line_count: this.parseNumber(lineCount, undefined),  // D: 订单行数
      line_no: parsedLineNo,                     // E: 订单序位
      internal_sku: parsedSkuCode,               // F: 商家编码
      fin_code: this.parseString(finCode),       // G: 财务核算编码
      qty_sold: parsedQty,                       // H: 销售数量(三段式)
      recv_customer: parsedRecvCustomer,         // I: 应收客户
      recv_platform: parsedRecvPlatform,         // J: 应收平台
      extra_charge: parsedExtraCharge,           // K: 价外收费
      fee_platform_comm: parsedPlatformComm,     // L: 平台佣金
      fee_affiliate: parsedAffiliateFee,         // M: 分销佣金
      fee_other: parsedOtherFee,                 // N: 其它费用
      net_received: adjustedNetReceived,         // O: 应到账金额（已调整）

      // 元数据
      source_file: path.basename(sourceFile),
      source_line: sourceLine,
      amount_adjustment_warning: amountWarning || undefined  // 记录金额调整 warning
    };

    // 生成行键和行哈希
    factRow.platform = this.platform;
    factRow.row_key = generateRowKey(
      this.platform,
      parsedOrderId,
      parsedSkuCode,
      parsedLineNo
    );

    // 为行哈希选择关键字段（按PRD中定义：关键字段和金额数量字段）
    const hashData = {
      order_id: factRow.order_id,
      internal_sku: factRow.internal_sku,
      line_no: factRow.line_no,
      qty_sold: factRow.qty_sold,
      recv_customer: factRow.recv_customer,
      recv_platform: factRow.recv_platform,
      extra_charge: factRow.extra_charge,
      fee_platform_comm: factRow.fee_platform_comm,
      fee_affiliate: factRow.fee_affiliate,
      fee_other: factRow.fee_other,
      net_received: factRow.net_received
    };

    factRow.row_hash = generateRowHash(hashData);

    return factRow;
  }

  /**
   * 获取字段值（支持多个可能的字段名）
   * @param row 行数据
   * @param fieldNames 可能的字段名数组
   * @returns 字段值或undefined
   */
  private getFieldValue(row: any, fieldNames: string[]): any {
    for (const name of fieldNames) {
      if (row[name] !== undefined) {
        return row[name];
      }
    }
    return undefined;
  }
}
