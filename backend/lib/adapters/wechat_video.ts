/**
 * 微信视频号平台适配器
 * 处理微信视频号导出的对账单数据
 */
import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { PlatformAdapter, ProcessResult, ProcessParams, registerAdapter, checkAmountClosure } from './base';
import { FactRow, AggRow } from '../../../frontend/lib/types';

// 字段映射类型
interface FieldMapping {
  [key: string]: string;
}

/**
 * 微信视频号适配器
 */
class WechatVideoAdapter implements PlatformAdapter {
  // 平台标识
  readonly platformCode = 'wechat_video';

  // 平台名称
  readonly platformName = '微信视频号';

  // 支持的文件类型
  readonly supportedFileTypes = ['.xlsx'];

  // 所需文件定义
  readonly requiredFiles = [
    {
      key: 'statement',
      name: '收支明细',
      description: '微信视频号收支明细对账单',
      patterns: ['*收支明细*.xlsx', '*statement*.xlsx'],
      required: true,
    },
    {
      key: 'order',
      name: '订单明细',
      description: '微信视频号订单明细数据',
      patterns: ['*订单明细*.xlsx', '*order*.xlsx'],
      required: true,
    }
  ];

  // 字段映射
  private readonly fieldMappings: Record<string, FieldMapping> = {
    // 收支明细字段映射
    statement: {
      '交易时间': 'transaction_time',
      '业务流水号': 'business_flow_no',
      '商户订单号': 'merchant_order_no',
      '交易类型': 'transaction_type',
      '收支类型': 'income_expense_type',
      '收支金额(元)': 'amount',
      '收支方式': 'payment_method',
      '商品名称': 'product_name',
      '备注': 'remarks'
    },
    // 订单明细字段映射
    order: {
      '下单时间': 'order_time',
      '订单号': 'order_id',
      '商品ID': 'product_id',
      '商品名称': 'product_name',
      '规格': 'specification',
      '数量': 'quantity',
      '单价(元)': 'unit_price',
      '订单金额(元)': 'order_amount',
      '买家实付(元)': 'buyer_paid',
      '卖家实收(元)': 'seller_received',
      '佣金(元)': 'commission',
      '收支方式': 'payment_method',
      '订单状态': 'order_status'
    }
  };

  /**
   * 验证输入文件
   * @param params 处理参数
   * @returns 验证结果
   */
  async validateInput(params: ProcessParams): Promise<{ valid: boolean; message?: string }> {
    const { files } = params;

    // 检查是否有文件
    if (!files || files.length === 0) {
      return {
        valid: false,
        message: '没有提供文件'
      };
    }

    // 检查文件格式是否支持
    const validFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return this.supportedFileTypes.includes(ext);
    });

    if (validFiles.length === 0) {
      return {
        valid: false,
        message: `不支持的文件类型，仅支持: ${this.supportedFileTypes.join(', ')}`
      };
    }

    // 检查是否有收支明细文件
    const hasStatementFile = files.some(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[0].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    // 检查是否有订单明细文件
    const hasOrderFile = files.some(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[1].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!hasStatementFile) {
      return {
        valid: false,
        message: `缺少收支明细文件，文件名应匹配: ${this.requiredFiles[0].patterns.join(', ')}`
      };
    }

    if (!hasOrderFile) {
      return {
        valid: false,
        message: `缺少订单明细文件，文件名应匹配: ${this.requiredFiles[1].patterns.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * 预处理 - 读取并验证 Excel 文件
   * @param params 处理参数
   * @returns 预处理数据
   */
  async preprocess(params: ProcessParams): Promise<{
    statementData: any[];
    orderData: any[];
    statementFile: string;
    orderFile: string;
  }> {
    const { files } = params;

    // 找到收支明细文件
    const statementFile = files.find(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[0].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    // 找到订单明细文件
    const orderFile = files.find(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[1].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!statementFile || !orderFile) {
      throw new Error('缺少必要的文件');
    }

    // 读取并解析收支明细文件
    const statementData = await this.readExcelFile(statementFile);

    // 读取并解析订单明细文件
    const orderData = await this.readExcelFile(orderFile);

    // 验证表头
    this.validateHeaders(statementData, this.fieldMappings.statement, '收支明细');
    this.validateHeaders(orderData, this.fieldMappings.order, '订单明细');

    return {
      statementData,
      orderData,
      statementFile,
      orderFile
    };
  }

  /**
   * 读取 Excel 文件
   * @param filePath 文件路径
   * @returns 解析后的数据
   */
  private async readExcelFile(filePath: string): Promise<any[]> {
    // 读取文件
    const fileData = await fs.readFile(filePath);

    // 解析工作簿
    const workbook = XLSX.read(fileData);

    // 获取第一个工作表
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 转换为JSON
    return XLSX.utils.sheet_to_json(worksheet, { defval: null });
  }

  /**
   * 验证表头
   * @param data 数据
   * @param mapping 字段映射
   * @param fileType 文件类型描述
   */
  private validateHeaders(data: any[], mapping: FieldMapping, fileType: string): void {
    if (data.length === 0) {
      throw new Error(`${fileType}文件没有数据`);
    }

    const firstRow = data[0];
    const missingFields = Object.keys(mapping).filter(field => !(field in firstRow));

    if (missingFields.length > 0) {
      throw new Error(`${fileType}文件缺少必要的字段: ${missingFields.join(', ')}`);
    }
  }

  /**
   * 处理文件
   * @param params 处理参数
   * @returns 处理结果
   */
  async process(params: ProcessParams): Promise<ProcessResult> {
    const { platform, uploadId, year, month } = params;

    // 预处理：读取并验证文件
    const { statementData, orderData, statementFile, orderFile } = await this.preprocess(params);

    // 处理数据
    const factRows: FactRow[] = [];
    const warnings: string[] = [];

    // 1. 处理订单数据，创建事实表行
    for (let i = 0; i < orderData.length; i++) {
      const orderRow = orderData[i];

      // 跳过退款或已取消的订单
      if (orderRow['订单状态'] === '已退款' || orderRow['订单状态'] === '已取消') {
        continue;
      }

      try {
        const orderTime = new Date(orderRow['下单时间']);
        const orderMonth = orderTime.getMonth() + 1;
        const orderYear = orderTime.getFullYear();

        // 检查日期是否与请求的年月匹配
        if (orderYear !== year || orderMonth !== month) {
          warnings.push(`订单 ${orderRow['订单号']} 的日期 (${orderYear}-${orderMonth}) 与请求的处理期间 (${year}-${month}) 不匹配`);
          continue;
        }

        // 提取 SKU（商品ID）
        const internalSku = String(orderRow['商品ID']);

        // 计算费用和金额
        const quantity = Number(orderRow['数量']);
        const unitPrice = Number(orderRow['单价(元)']);
        const orderAmount = Number(orderRow['订单金额(元)']);
        const buyerPaid = Number(orderRow['买家实付(元)']);
        const sellerReceived = Number(orderRow['卖家实收(元)']);
        const commission = Number(orderRow['佣金(元)']);

        // 创建事实表行
        const factRow: FactRow = {
          platform,
          upload_id: uploadId,
          year,
          month,
          order_id: orderRow['订单号'],
          line_count: 1, // 微信视频号每个订单只有一行
          line_no: 1,
          internal_sku: internalSku,
          fin_code: internalSku, // 使用商品ID作为财务编码
          qty_sold: quantity,
          recv_customer: buyerPaid,
          recv_platform: sellerReceived + commission, // 平台收到 = 卖家实收 + 佣金
          extra_charge: 0, // 微信视频号没有额外费用
          fee_platform_comm: commission,
          fee_affiliate: 0, // 微信视频号没有联盟佣金
          fee_other: 0, // 微信视频号没有其他费用
          net_received: sellerReceived,
          source_file: path.basename(orderFile),
          source_line: i + 2, // Excel 行索引（+2 是因为有表头和 0-索引）
        };

        // 验证金额闭环
        if (!checkAmountClosure(factRow)) {
          warnings.push(`订单 ${factRow.order_id} 的金额计算不闭环`);
        }

        factRows.push(factRow);
      } catch (err) {
        warnings.push(`处理订单 ${orderRow['订单号']} 时出错: ${err.message}`);
      }
    }

    // 2. 聚合数据生成聚合表
    const skuSummary: Record<string, AggRow> = {};

    for (const row of factRows) {
      const { internal_sku } = row;

      if (!skuSummary[internal_sku]) {
        skuSummary[internal_sku] = {
          platform,
          upload_id: uploadId,
          year,
          month,
          internal_sku,
          qty_sold_sum: 0,
          income_total_sum: 0,
          fee_platform_comm_sum: 0,
          fee_other_sum: 0,
          net_received_sum: 0,
          record_count: 0,
        };
      }

      const summary = skuSummary[internal_sku];
      summary.qty_sold_sum += row.qty_sold;
      summary.income_total_sum += row.recv_platform;
      summary.fee_platform_comm_sum += row.fee_platform_comm;
      summary.fee_other_sum += row.fee_other + row.fee_affiliate; // 合并其他费用和联盟佣金
      summary.net_received_sum += row.net_received;
      summary.record_count += 1;
    }

    // 将聚合数据转换为数组，并保留两位小数
    const aggRows = Object.values(skuSummary).map(summary => ({
      ...summary,
      income_total_sum: parseFloat(summary.income_total_sum.toFixed(2)),
      fee_platform_comm_sum: parseFloat(summary.fee_platform_comm_sum.toFixed(2)),
      fee_other_sum: parseFloat(summary.fee_other_sum.toFixed(2)),
      net_received_sum: parseFloat(summary.net_received_sum.toFixed(2)),
    }));

    // 返回结果
    return {
      factRows,
      aggRows,
      warnings
    };
  }

  /**
   * 清理临时资源
   */
  async cleanup(params: ProcessParams): Promise<void> {
    // 微信视频号适配器不需要清理特殊的临时资源
  }
}

// 注册适配器
registerAdapter(new WechatVideoAdapter());

// 导出适配器类型
export type { WechatVideoAdapter };