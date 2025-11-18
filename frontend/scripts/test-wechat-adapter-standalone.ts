/**
 * 微信视频号适配器测试脚本 - 独立版
 *
 * 用于解析并验证微信视频号样例数据
 * 运行方式: ts-node scripts/test-wechat-adapter-standalone.ts
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import csv from 'csv-parser';

// 导入基类定义
interface Platform {
  name: string;
  description: string;
  platform: string;
}

interface ParseOptions {
  platform: string;
  year: number;
  month: number;
  userId: string;
}

interface ParseResult {
  factRows: FactRow[];
  warnings: string[];
}

interface FactRow {
  year: number;
  month: number;
  order_id: string;
  line_count?: number;
  line_no?: number;
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
  platform: string;
  row_key?: string;
  row_hash?: string;
  source_file?: string;
  source_line?: number;
}

interface AggRow {
  platform: string;
  internal_sku: string;
  year: number;
  month: number;
  qty_sold_sum: number;
  income_total_sum: number;
  fee_platform_comm_sum: number;
  fee_other_sum: number;
  net_received_sum: number;
  record_count: number;
}

/**
 * 生成行键
 */
function generateRowKey(platform: string, orderId: string, skuCode: string, lineNo?: number): string {
  if (lineNo !== undefined) {
    return `${platform}:${orderId}:${skuCode}:${lineNo}`;
  }
  return `${platform}:${orderId}:${skuCode}`;
}

/**
 * 生成行哈希
 */
function generateRowHash(data: Record<string, any>): string {
  const keys = Object.keys(data).sort();
  const values = keys.map(key => data[key]);
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(values));
  return hash.digest('hex');
}

/**
 * 平台适配器基类
 */
abstract class PlatformAdapter implements Platform {
  abstract readonly platform: string;
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * 解析文件
   */
  abstract parseFiles(settlementFilePath: string, ordersFilePath: string | null, options: ParseOptions): Promise<ParseResult>;

  /**
   * 解析字符串为数字
   * @param value 字符串或数字
   * @param defaultValue 默认值
   */
  protected parseNumber(value: any, defaultValue: number | undefined = 0): number {
    if (value === null || value === undefined || value === '') {
      return defaultValue !== undefined ? defaultValue : 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    const num = parseFloat(String(value).replace(/,/g, '').trim());
    return isNaN(num) ? (defaultValue !== undefined ? defaultValue : 0) : num;
  }

  /**
   * 解析字符串
   * @param value 字符串或其他类型
   */
  protected parseString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  /**
   * 验证FactRow行数据
   * @param row FactRow行数据
   * @returns 错误消息或undefined
   */
  protected validateRow(row: FactRow): string | undefined {
    // 验证必填字段
    if (!row.order_id) return '订单号不能为空';
    if (!row.internal_sku) return 'SKU编码不能为空';

    // 验证数字字段
    if (isNaN(row.qty_sold)) return '数量必须是数字';
    if (isNaN(row.recv_customer)) return '应收买家必须是数字';
    if (isNaN(row.recv_platform)) return '应收平台必须是数字';
    if (isNaN(row.extra_charge)) return '价外收费必须是数字';
    if (isNaN(row.fee_platform_comm)) return '平台佣金必须是数字';
    if (isNaN(row.fee_affiliate)) return '分销佣金必须是数字';
    if (isNaN(row.fee_other)) return '其他费用必须是数字';
    if (isNaN(row.net_received)) return '结算金额必须是数字';

    return undefined;
  }
}

/**
 * 微信视频号平台适配器
 */
export class WechatVideoAdapter extends PlatformAdapter {
  readonly platform: string = 'wechat_video';
  readonly name: string = '微信视频号';
  readonly description: string = '微信视频号电商平台';

  /**
   * 解析文件
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
    parser.on('data', (data: any) => results.push(data));

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
        // 映射微信视频号字段到标准字段
        const factRow = this.mapRowToFactRow(row, options, filePath, lineNumber);

        // 验证行
        const validationError = this.validateRow(factRow);
        if (validationError) {
          result.warnings.push(`行${lineNumber}: ${validationError}`);
          continue;
        }

        // 添加到结果
        result.factRows.push(factRow);
      } catch (err: any) {
        result.warnings.push(`行${lineNumber}: 解析错误 - ${err.message || err}`);
      }
    }

    return result;
  }

  /**
   * 解析Excel文件
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
        // 映射微信视频号字段到标准字段
        const factRow = this.mapRowToFactRow(row, options, filePath, lineNumber);

        // 验证行
        const validationError = this.validateRow(factRow);
        if (validationError) {
          result.warnings.push(`行${lineNumber}: ${validationError}`);
          continue;
        }

        // 添加到结果
        result.factRows.push(factRow);
      } catch (err: any) {
        result.warnings.push(`行${lineNumber}: 解析错误 - ${err.message || err}`);
      }
    }

    return result;
  }

  /**
   * 映射原始行数据到FactRow
   */
  private mapRowToFactRow(
    row: any,
    options: ParseOptions,
    sourceFile: string,
    sourceLine: number
  ): FactRow {
    // 微信视频号字段映射
    const orderId = this.getFieldValue(row, ['订单号', 'Order No.', 'Order Number']);
    const lineCount = this.getFieldValue(row, ['商品行数', '行数', 'Line Count']);
    const lineNo = this.getFieldValue(row, ['行号', '商品行号', 'Line No.', 'Line Number']);
    const skuCode = this.getFieldValue(row, ['商品编码', '商家编码', 'Product Code', 'SKU', 'SKU编码(自定义)']);
    const quantity = this.getFieldValue(row, ['数量', 'Quantity', 'Qty', '商品数量']);
    const buyerPayment = this.getFieldValue(row, ['实收金额', '应收买家', 'Actual Received', '订单实际收款金额', '商品实际价格(总共)']);
    const platformPayment = this.getFieldValue(row, ['平台补贴', '应收平台', 'Platform Subsidy']);
    const additionalFee = this.getFieldValue(row, ['附加费用', '价外收费', 'Additional Fee']);
    const platformComm = this.getFieldValue(row, ['平台佣金', 'Platform Commission']);
    const distributionFee = this.getFieldValue(row, ['分销服务费', '分销佣金', 'Distribution Fee']);
    const otherFee = this.getFieldValue(row, ['其他费用', 'Other Fee']);
    const settlement = this.getFieldValue(row, ['结算金额', 'Settlement Amount']);

    // 财务编码（如果没有，则使用SKU编码）
    const finCode = this.getFieldValue(row, ['财务编码', 'Financial Code', 'Fin Code']) || skuCode;

    // 创建FactRow对象
    const parsedOrderId = this.parseString(orderId);
    const parsedSkuCode = this.parseString(skuCode);
    const parsedLineNo = this.parseNumber(lineNo, undefined);

    const factRow: FactRow = {
      year: options.year,
      month: options.month,
      order_id: parsedOrderId,
      line_count: this.parseNumber(lineCount, undefined),
      line_no: parsedLineNo,
      internal_sku: parsedSkuCode,
      fin_code: this.parseString(finCode),
      qty_sold: this.parseNumber(quantity),
      recv_customer: this.parseNumber(buyerPayment),
      recv_platform: this.parseNumber(platformPayment),
      extra_charge: this.parseNumber(additionalFee),
      fee_platform_comm: this.parseNumber(platformComm),
      fee_affiliate: this.parseNumber(distributionFee),
      fee_other: this.parseNumber(otherFee),
      net_received: this.parseNumber(settlement),
      platform: this.platform,

      // 元数据
      source_file: path.basename(sourceFile),
      source_line: sourceLine
    };

    // 生成行键和行哈希
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

// 样例数据路径
const DEMO_FILE_1 = path.join(process.cwd(), '..', 'demo-1024-视频号模型_规则样例_251026.xlsx');
const DEMO_FILE_2 = path.join(process.cwd(), '..', 'demo-视频号订单结算8月_样例_251026.xlsx');

// 输出目录
const OUTPUT_DIR = path.join(process.cwd(), 'expected', 'wechat_video');

// 测试年月
const TEST_YEAR = 2024;
const TEST_MONTH = 10;
const TEST_USER_ID = 'test-user-001';

/**
 * 生成聚合数据
 */
function generateAggregates(factRows: FactRow[]): AggRow[] {
  // SKU分组
  const skuGroups = new Map<string, FactRow[]>();

  // 按SKU分组
  for (const row of factRows) {
    const sku = row.internal_sku;
    const rows = skuGroups.get(sku) || [];
    rows.push(row);
    skuGroups.set(sku, rows);
  }

  // 聚合数据
  const aggRows: AggRow[] = [];

  // 计算聚合
  for (const [sku, rows] of skuGroups.entries()) {
    const aggRow: AggRow = {
      platform: 'wechat_video',
      internal_sku: sku,
      year: TEST_YEAR,
      month: TEST_MONTH,
      qty_sold_sum: 0,
      income_total_sum: 0,
      fee_platform_comm_sum: 0,
      fee_other_sum: 0,
      net_received_sum: 0,
      record_count: rows.length
    };

    // 合计各指标
    for (const row of rows) {
      aggRow.qty_sold_sum += row.qty_sold;
      aggRow.income_total_sum += (row.recv_customer + row.recv_platform + row.extra_charge);
      aggRow.fee_platform_comm_sum += row.fee_platform_comm;
      aggRow.fee_other_sum += (row.fee_affiliate + row.fee_other);
      aggRow.net_received_sum += row.net_received;
    }

    // 四舍五入到2位小数
    aggRow.qty_sold_sum = Math.round(aggRow.qty_sold_sum * 100) / 100;
    aggRow.income_total_sum = Math.round(aggRow.income_total_sum * 100) / 100;
    aggRow.fee_platform_comm_sum = Math.round(aggRow.fee_platform_comm_sum * 100) / 100;
    aggRow.fee_other_sum = Math.round(aggRow.fee_other_sum * 100) / 100;
    aggRow.net_received_sum = Math.round(aggRow.net_received_sum * 100) / 100;

    aggRows.push(aggRow);
  }

  return aggRows;
}

/**
 * 验证聚合数据一致性
 */
function validateAggregates(aggRows: AggRow[]): string[] {
  const warnings: string[] = [];

  for (const row of aggRows) {
    const expectedNetReceived = row.income_total_sum - row.fee_platform_comm_sum - row.fee_other_sum;
    const roundedExpected = Math.round(expectedNetReceived * 100) / 100;
    const roundedActual = Math.round(row.net_received_sum * 100) / 100;

    if (Math.abs(roundedExpected - roundedActual) > 0.02) {
      warnings.push(`SKU ${row.internal_sku} 聚合一致性校验失败: 期望 ${roundedExpected}, 实际 ${roundedActual}`);
    }
  }

  return warnings;
}

/**
 * 生成CSV文件
 */
async function generateCSV(rows: any[], filePath: string, headers: string[]): Promise<void> {
  // 确保目录存在
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  // 生成CSV内容
  const lines: string[] = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'number') {
        // 数字格式化为2位小数
        return value.toFixed(2);
      } else {
        // 字符串需要处理逗号、换行等特殊字符
        return `"${String(value).replace(/"/g, '""')}"`;
      }
    });

    lines.push(values.join(','));
  }

  // 写入文件
  await fs.writeFile(filePath, lines.join('\n'));
  console.log(`已生成CSV文件: ${filePath}`);
}

/**
 * 运行测试
 */
async function runTest(filePath: string, outputName: string): Promise<void> {
  console.log(`测试文件: ${path.basename(filePath)}`);

  try {
    // 创建适配器
    const adapter = new WechatVideoAdapter();

    // 解析文件
    const result = await adapter.parseFiles(
      filePath,
      null,
      {
        platform: 'wechat_video',
        year: TEST_YEAR,
        month: TEST_MONTH,
        userId: TEST_USER_ID
      }
    );

    console.log(`解析结果: ${result.factRows.length}行数据, ${result.warnings.length}个警告`);

    if (result.warnings.length > 0) {
      console.log('警告:');
      result.warnings.forEach((warning, i) => {
        console.log(`  ${i+1}. ${warning}`);
      });
    }

    // 生成聚合数据
    const aggRows = generateAggregates(result.factRows);
    console.log(`生成聚合数据: ${aggRows.length}行`);

    // 验证聚合数据一致性
    const aggWarnings = validateAggregates(aggRows);
    if (aggWarnings.length > 0) {
      console.log('聚合数据警告:');
      aggWarnings.forEach((warning, i) => {
        console.log(`  ${i+1}. ${warning}`);
      });
    } else {
      console.log('聚合数据一致性校验通过');
    }

    // 行键和行哈希检查
    let rowKeyCount = 0;
    let rowHashCount = 0;
    for (const row of result.factRows) {
      if (row.row_key) rowKeyCount++;
      if (row.row_hash) rowHashCount++;
    }
    console.log(`行键生成: ${rowKeyCount}/${result.factRows.length}`);
    console.log(`行哈希生成: ${rowHashCount}/${result.factRows.length}`);

    // 生成预期CSV文件
    const factHeaders = ['year', 'month', 'order_id', 'line_count', 'line_no', 'internal_sku', 'fin_code',
                       'qty_sold', 'recv_customer', 'recv_platform', 'extra_charge', 'fee_platform_comm',
                       'fee_affiliate', 'fee_other', 'net_received', 'platform', 'row_key', 'row_hash'];

    const aggHeaders = ['internal_sku', 'platform', 'year', 'month', 'qty_sold_sum', 'income_total_sum',
                      'fee_platform_comm_sum', 'fee_other_sum', 'net_received_sum', 'record_count'];

    await generateCSV(result.factRows, path.join(OUTPUT_DIR, `${outputName}_fact.csv`), factHeaders);
    await generateCSV(aggRows, path.join(OUTPUT_DIR, `${outputName}_agg.csv`), aggHeaders);

    console.log('测试完成');
  } catch (err: any) {
    console.error(`测试失败:`, err.message || err);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('开始测试微信视频号适配器...');

  // 运行样例1测试
  await runTest(DEMO_FILE_1, 'expected_model');
  console.log('\n');

  // 运行样例2测试
  await runTest(DEMO_FILE_2, 'expected');

  console.log('\n所有测试完成');
}

// 运行测试
main();