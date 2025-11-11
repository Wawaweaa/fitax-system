/**
 * 抖音平台适配器 - 处理抖音平台的数据文件
 */
import fs from 'fs/promises';
import path from 'path';
import * as csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { FactRow, Platform } from '../../lib/types';
import { PlatformAdapter, ParseOptions, ParseResult } from './base';

/**
 * 抖音平台适配器
 */
export class DouyinAdapter extends PlatformAdapter {
  /**
   * 平台ID
   */
  readonly platform: Platform = 'douyin';

  /**
   * 平台名称
   */
  readonly name: string = '抖音';

  /**
   * 平台描述
   */
  readonly description: string = '抖音电商平台';

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
      throw new Error(`不支持的文件格式: ${ext}，抖音平台支持CSV和Excel格式`);
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

    // 创建CSV解析器
    const parser = csv();

    // 设置事件处理程序
    parser.on('data', (data) => results.push(data));

    // 处理CSV数据
    Readable.from(fileContent).pipe(parser);

    // 等待解析完成
    await new Promise<void>((resolve) => parser.on('end', () => resolve()));

    const rows = results;

    // 检查文件是否为空
    if (rows.length === 0) {
      result.warnings.push('文件为空，没有数据可处理');
      return result;
    }

    // 解析行
    let lineNumber = 1;
    for (const row of rows) {
      lineNumber++;
      try {
        // 映射抖音字段到标准字段
        const factRow = this.mapRowToFactRow(row, options, filePath, lineNumber);

        // 验证行
        const validationError = this.validateRow(factRow);
        if (validationError) {
          result.warnings.push(`行${lineNumber}: ${validationError}`);
          continue;
        }

        // 添加到结果
        result.factRows.push(factRow);
      } catch (err) {
        result.warnings.push(`行${lineNumber}: 解析错误 - ${err.message}`);
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

    // 检查文件是否为空
    if (rows.length === 0) {
      result.warnings.push('文件为空，没有数据可处理');
      return result;
    }

    // 解析行
    let lineNumber = 1;
    for (const row of rows) {
      lineNumber++;
      try {
        // 映射抖音字段到标准字段
        const factRow = this.mapRowToFactRow(row, options, filePath, lineNumber);

        // 验证行
        const validationError = this.validateRow(factRow);
        if (validationError) {
          result.warnings.push(`行${lineNumber}: ${validationError}`);
          continue;
        }

        // 添加到结果
        result.factRows.push(factRow);
      } catch (err) {
        result.warnings.push(`行${lineNumber}: 解析错误 - ${err.message}`);
      }
    }

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
    // 抖音字段映射
    // 此处需要根据实际抖音结算单字段进行调整
    // 示例字段映射：
    // - 订单号：订单编号/Order ID
    // - 商品编码：商品编码/Product Code
    // - 数量：购买数量/Purchase Quantity
    // - 应收买家：买家支付金额/Buyer Payment
    // - 应收平台：平台补贴/Platform Subsidy
    // - 价外收费：附加费用/Additional Fee
    // - 平台佣金：平台服务费/Platform Service Fee
    // - 分销佣金：达人佣金/KOL Commission
    // - 其他费用：其他费用/Other Fee
    // - 结算金额：结算金额/Settlement Amount

    // 尝试获取各个字段（处理字段名可能的变体）
    const orderId = this.getFieldValue(row, ['订单编号', '订单号', 'Order ID', 'Order Number']);
    const skuCode = this.getFieldValue(row, ['商品编码', '商家编码', 'Product Code', 'SKU']);
    const quantity = this.getFieldValue(row, ['购买数量', '数量', 'Purchase Quantity', 'Qty']);
    const buyerPayment = this.getFieldValue(row, ['买家支付金额', '应收买家', 'Buyer Payment']);
    const platformPayment = this.getFieldValue(row, ['平台补贴', '应收平台', 'Platform Subsidy']);
    const additionalFee = this.getFieldValue(row, ['附加费用', '价外收费', 'Additional Fee']);
    const platformComm = this.getFieldValue(row, ['平台服务费', '平台佣金', 'Platform Service Fee']);
    const distributionFee = this.getFieldValue(row, ['达人佣金', '分销佣金', 'KOL Commission']);
    const otherFee = this.getFieldValue(row, ['其他费用', 'Other Fee']);
    const settlement = this.getFieldValue(row, ['结算金额', 'Settlement Amount']);

    // 财务编码（如果没有，则使用SKU编码）
    const finCode = this.getFieldValue(row, ['财务编码', 'Financial Code', 'Fin Code']) || skuCode;

    // 创建FactRow对象
    const factRow: FactRow = {
      year: options.year,
      month: options.month,
      order_id: this.parseString(orderId),
      line_count: null, // 抖音可能没有行数信息
      line_no: null,    // 抖音可能没有行号信息
      internal_sku: this.parseString(skuCode),
      fin_code: this.parseString(finCode),
      qty_sold: this.parseNumber(quantity),
      recv_customer: this.parseNumber(buyerPayment),
      recv_platform: this.parseNumber(platformPayment),
      extra_charge: this.parseNumber(additionalFee),
      fee_platform_comm: this.parseNumber(platformComm),
      fee_affiliate: this.parseNumber(distributionFee),
      fee_other: this.parseNumber(otherFee),
      net_received: this.parseNumber(settlement),

      // 元数据
      source_file: path.basename(sourceFile),
      source_line: sourceLine
    };

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