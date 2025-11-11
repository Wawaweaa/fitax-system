/**
 * 抖音平台适配器
 * 处理抖音小店导出的交易数据
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
 * 抖音小店适配器
 */
class DouyinAdapter implements PlatformAdapter {
  // 平台标识
  readonly platformCode = 'douyin';

  // 平台名称
  readonly platformName = '抖音小店';

  // 支持的文件类型
  readonly supportedFileTypes = ['.xlsx', '.xls', '.csv'];

  // 所需文件定义
  readonly requiredFiles = [
    {
      key: 'order',
      name: '订单明细',
      description: '抖音小店订单明细数据',
      patterns: ['*订单明细*.xlsx', '*订单*.csv', '*order*.xlsx'],
      required: true,
    },
    {
      key: 'finance',
      name: '财务明细',
      description: '抖音小店财务明细数据',
      patterns: ['*财务明细*.xlsx', '*财务*.csv', '*finance*.xlsx'],
      required: true,
    }
  ];

  // 字段映射
  private readonly fieldMappings: Record<string, FieldMapping> = {
    // 订单明细字段映射
    order: {
      '订单号': 'order_id',
      '子订单号': 'sub_order_id',
      '商品ID': 'product_id',
      '商品名称': 'product_name',
      '规格': 'specification',
      'SKU编码': 'sku_code',
      '商家SKU编码': 'merchant_sku_code',
      '购买数量': 'quantity',
      '商品单价': 'unit_price',
      '订单金额': 'order_amount',
      '优惠金额': 'discount_amount',
      '运费': 'shipping_fee',
      '用户实付金额': 'buyer_paid',
      '订单状态': 'order_status',
      '创建时间': 'create_time',
      '支付时间': 'payment_time',
    },
    // 财务明细字段映射
    finance: {
      '订单号': 'order_id',
      '子订单号': 'sub_order_id',
      '交易流水号': 'transaction_id',
      '收入类型': 'income_type',
      '支出类型': 'expense_type',
      '收支金额': 'amount',
      '收支时间': 'transaction_time',
      '结算状态': 'settlement_status',
      '商品佣金': 'commission',
      '平台服务费': 'platform_fee',
      '其他费用': 'other_fees',
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

    // 检查是否有订单明细文件
    const hasOrderFile = files.some(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[0].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    // 检查是否有财务明细文件
    const hasFinanceFile = files.some(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[1].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!hasOrderFile) {
      return {
        valid: false,
        message: `缺少订单明细文件，文件名应匹配: ${this.requiredFiles[0].patterns.join(', ')}`
      };
    }

    if (!hasFinanceFile) {
      return {
        valid: false,
        message: `缺少财务明细文件，文件名应匹配: ${this.requiredFiles[1].patterns.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * 预处理 - 读取并验证文件
   * @param params 处理参数
   * @returns 预处理数据
   */
  async preprocess(params: ProcessParams): Promise<{
    orderData: any[];
    financeData: any[];
    orderFile: string;
    financeFile: string;
  }> {
    const { files } = params;

    // 找到订单明细文件
    const orderFile = files.find(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[0].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    // 找到财务明细文件
    const financeFile = files.find(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[1].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!orderFile || !financeFile) {
      throw new Error('缺少必要的文件');
    }

    // 读取并解析订单明细文件
    const orderData = await this.readFile(orderFile);

    // 读取并解析财务明细文件
    const financeData = await this.readFile(financeFile);

    // 验证表头
    this.validateHeaders(orderData, this.fieldMappings.order, '订单明细');
    this.validateHeaders(financeData, this.fieldMappings.finance, '财务明细');

    return {
      orderData,
      financeData,
      orderFile,
      financeFile
    };
  }

  /**
   * 读取文件 (支持 Excel 和 CSV)
   * @param filePath 文件路径
   * @returns 解析后的数据
   */
  private async readFile(filePath: string): Promise<any[]> {
    // 读取文件
    const fileData = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

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
    const { orderData, financeData, orderFile, financeFile } = await this.preprocess(params);

    // 创建财务数据索引，按订单号和子订单号组织
    const financeMap: Record<string, any[]> = {};
    for (const finance of financeData) {
      const orderId = finance['订单号'];
      const subOrderId = finance['子订单号'] || ''; // 有些平台可能没有子订单号
      const key = `${orderId}:${subOrderId}`;

      if (!financeMap[key]) {
        financeMap[key] = [];
      }
      financeMap[key].push(finance);
    }

    // 处理数据
    const factRows: FactRow[] = [];
    const warnings: string[] = [];

    // 处理订单数据，创建事实表行
    for (let i = 0; i < orderData.length; i++) {
      const orderRow = orderData[i];
      const orderId = orderRow['订单号'];
      const subOrderId = orderRow['子订单号'] || '';
      const key = `${orderId}:${subOrderId}`;

      // 跳过已取消或已关闭的订单
      if (
        orderRow['订单状态'] === '已取消' ||
        orderRow['订单状态'] === '已关闭' ||
        orderRow['订单状态'] === '退款成功'
      ) {
        continue;
      }

      try {
        // 获取创建时间或支付时间，优先使用支付时间
        const orderTime = new Date(orderRow['支付时间'] || orderRow['创建时间']);
        const orderMonth = orderTime.getMonth() + 1;
        const orderYear = orderTime.getFullYear();

        // 检查日期是否与请求的年月匹配
        if (orderYear !== year || orderMonth !== month) {
          warnings.push(`订单 ${orderId} 的日期 (${orderYear}-${orderMonth}) 与请求的处理期间 (${year}-${month}) 不匹配`);
          continue;
        }

        // 获取该订单的财务信息
        const financeRecords = financeMap[key] || [];

        // 计算各类费用
        let commission = 0;
        let platformFee = 0;
        let otherFees = 0;
        let hasFinance = false;

        for (const finance of financeRecords) {
          hasFinance = true;

          // 佣金
          if (finance['商品佣金']) {
            commission += Math.abs(parseFloat(finance['商品佣金'] || 0));
          }

          // 平台服务费
          if (finance['平台服务费']) {
            platformFee += Math.abs(parseFloat(finance['平台服务费'] || 0));
          }

          // 其他费用
          if (finance['其他费用']) {
            otherFees += Math.abs(parseFloat(finance['其他费用'] || 0));
          }

          // 如果没有具体分类的费用字段，则按收支类型判断
          if (!finance['商品佣金'] && !finance['平台服务费'] && !finance['其他费用']) {
            if (finance['支出类型'] === '佣金' || finance['支出类型']?.includes('佣金')) {
              commission += Math.abs(parseFloat(finance['收支金额'] || 0));
            } else if (finance['支出类型'] === '服务费' || finance['支出类型']?.includes('服务')) {
              platformFee += Math.abs(parseFloat(finance['收支金额'] || 0));
            } else if (finance['支出类型'] && finance['收支金额']) {
              otherFees += Math.abs(parseFloat(finance['收支金额'] || 0));
            }
          }
        }

        // 如果没有找到对应财务信息，记录警告但继续处理
        if (!hasFinance) {
          warnings.push(`订单 ${orderId} ${subOrderId ? `(子订单 ${subOrderId})` : ''} 没有找到财务记录`);
        }

        // 提取 SKU 信息
        const internalSku = orderRow['商家SKU编码'] || orderRow['SKU编码'] || orderRow['商品ID'];

        // 计算费用和金额
        const quantity = parseInt(orderRow['购买数量'] || 0);
        const unitPrice = parseFloat(orderRow['商品单价'] || 0);
        const orderAmount = parseFloat(orderRow['订单金额'] || 0);
        const discountAmount = parseFloat(orderRow['优惠金额'] || 0);
        const shippingFee = parseFloat(orderRow['运费'] || 0);
        const buyerPaid = parseFloat(orderRow['用户实付金额'] || 0);

        // 计算平台收到的金额
        const recvPlatform = buyerPaid; // 用户实付 = 平台收到

        // 计算净收入
        const netReceived = recvPlatform - commission - platformFee - otherFees;

        // 创建事实表行
        const factRow: FactRow = {
          platform,
          upload_id: uploadId,
          year,
          month,
          order_id: orderId + (subOrderId ? `-${subOrderId}` : ''),
          line_count: 1, // 抖音每个子订单是一行
          line_no: 1,
          internal_sku: String(internalSku),
          fin_code: String(internalSku), // 使用 SKU 作为财务编码
          qty_sold: quantity,
          recv_customer: buyerPaid,
          recv_platform: recvPlatform,
          extra_charge: shippingFee, // 额外收费（运费）
          fee_platform_comm: commission, // 平台佣金
          fee_affiliate: 0, // 抖音通常不单独列出联盟佣金
          fee_other: platformFee + otherFees, // 平台服务费和其他费用
          net_received: netReceived,
          source_file: path.basename(orderFile),
          source_line: i + 2, // Excel 行索引（+2 是因为有表头和 0-索引）
        };

        // 验证金额闭环
        if (!checkAmountClosure(factRow)) {
          warnings.push(`订单 ${factRow.order_id} 的金额计算不闭环`);
        }

        factRows.push(factRow);
      } catch (err) {
        warnings.push(`处理订单 ${orderId} ${subOrderId ? `(子订单 ${subOrderId})` : ''} 时出错: ${err.message}`);
      }
    }

    // 聚合数据生成聚合表
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
    // 抖音适配器不需要清理特殊的临时资源
  }
}

// 注册适配器
registerAdapter(new DouyinAdapter());

// 导出适配器类型
export type { DouyinAdapter };