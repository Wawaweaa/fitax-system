/**
 * 小红书平台适配器
 * 处理小红书导出的交易数据
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
 * 小红书适配器
 */
class XiaohongshuAdapter implements PlatformAdapter {
  // 平台标识
  readonly platformCode = 'xiaohongshu';

  // 平台名称
  readonly platformName = '小红书';

  // 支持的文件类型
  readonly supportedFileTypes = ['.xlsx', '.csv'];

  // 所需文件定义
  readonly requiredFiles = [
    {
      key: 'order',
      name: '订单明细',
      description: '小红书订单明细数据',
      patterns: ['*订单明细*.xlsx', '*orders*.xlsx', '*订单*.csv'],
      required: true,
    },
    {
      key: 'settlement',
      name: '结算明细',
      description: '小红书结算明细数据',
      patterns: ['*结算明细*.xlsx', '*settlement*.xlsx', '*结算*.csv'],
      required: true,
    }
  ];

  // 字段映射
  private readonly fieldMappings: Record<string, FieldMapping> = {
    // 订单明细字段映射
    order: {
      '订单编号': 'order_id',
      '商品编号': 'product_id',
      '商品名称': 'product_name',
      '商品规格': 'specification',
      'SKU编码': 'sku_code',
      '商家SKU编码': 'merchant_sku_code',
      '购买数量': 'quantity',
      '订单金额': 'order_amount',
      '优惠金额': 'discount_amount',
      '运费': 'shipping_fee',
      '买家实付金额': 'buyer_paid',
      '订单状态': 'order_status',
      '下单时间': 'order_time',
    },
    // 结算明细字段映射
    settlement: {
      '订单编号': 'order_id',
      '结算单号': 'settlement_id',
      '结算时间': 'settlement_time',
      '商品名称': 'product_name',
      '商品金额': 'product_amount',
      '佣金': 'commission',
      '结算金额': 'settlement_amount',
      '结算状态': 'settlement_status',
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

    // 检查是否有结算明细文件
    const hasSettlementFile = files.some(file => {
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

    if (!hasSettlementFile) {
      return {
        valid: false,
        message: `缺少结算明细文件，文件名应匹配: ${this.requiredFiles[1].patterns.join(', ')}`
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
    settlementData: any[];
    orderFile: string;
    settlementFile: string;
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

    // 找到结算明细文件
    const settlementFile = files.find(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[1].patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!orderFile || !settlementFile) {
      throw new Error('缺少必要的文件');
    }

    // 读取并解析订单明细文件
    const orderData = await this.readFile(orderFile);

    // 读取并解析结算明细文件
    const settlementData = await this.readFile(settlementFile);

    // 验证表头
    this.validateHeaders(orderData, this.fieldMappings.order, '订单明细');
    this.validateHeaders(settlementData, this.fieldMappings.settlement, '结算明细');

    return {
      orderData,
      settlementData,
      orderFile,
      settlementFile
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
    const { orderData, settlementData, orderFile, settlementFile } = await this.preprocess(params);

    // 创建结算数据索引，用于快速查找
    const settlementMap: Record<string, any[]> = {};
    for (const settlement of settlementData) {
      const orderId = settlement['订单编号'];
      if (!settlementMap[orderId]) {
        settlementMap[orderId] = [];
      }
      settlementMap[orderId].push(settlement);
    }

    // 处理数据
    const factRows: FactRow[] = [];
    const warnings: string[] = [];

    // 处理订单数据，创建事实表行
    for (let i = 0; i < orderData.length; i++) {
      const orderRow = orderData[i];
      const orderId = orderRow['订单编号'];

      // 跳过已取消或退款的订单
      if (orderRow['订单状态'].includes('取消') || orderRow['订单状态'].includes('退款')) {
        continue;
      }

      try {
        const orderTime = new Date(orderRow['下单时间']);
        const orderMonth = orderTime.getMonth() + 1;
        const orderYear = orderTime.getFullYear();

        // 检查日期是否与请求的年月匹配
        if (orderYear !== year || orderMonth !== month) {
          warnings.push(`订单 ${orderId} 的日期 (${orderYear}-${orderMonth}) 与请求的处理期间 (${year}-${month}) 不匹配`);
          continue;
        }

        // 获取该订单的结算信息
        const settlements = settlementMap[orderId] || [];

        // 计算总佣金和结算金额
        let totalCommission = 0;
        let totalSettlement = 0;
        let hasSettlement = false;

        for (const settlement of settlements) {
          if (settlement['结算状态'] !== '已结算') {
            continue;
          }

          hasSettlement = true;
          totalCommission += parseFloat(settlement['佣金'] || 0);
          totalSettlement += parseFloat(settlement['结算金额'] || 0);
        }

        // 如果没有找到对应结算信息，记录警告但继续处理
        if (!hasSettlement) {
          warnings.push(`订单 ${orderId} 没有找到已结算的结算记录`);
        }

        // 提取 SKU 信息
        const internalSku = orderRow['商家SKU编码'] || orderRow['SKU编码'] || orderRow['商品编号'];

        // 计算费用和金额
        const quantity = parseInt(orderRow['购买数量'] || 0);
        const orderAmount = parseFloat(orderRow['订单金额'] || 0);
        const discountAmount = parseFloat(orderRow['优惠金额'] || 0);
        const shippingFee = parseFloat(orderRow['运费'] || 0);
        const buyerPaid = parseFloat(orderRow['买家实付金额'] || 0);

        // 计算其他费用（非佣金）
        // 对于小红书，其他费用通常包括平台补贴、优惠券等
        const otherFees = orderAmount - buyerPaid - totalCommission;

        // 创建事实表行
        const factRow: FactRow = {
          platform,
          upload_id: uploadId,
          year,
          month,
          order_id: orderId,
          line_count: 1, // 小红书每个订单通常只有一行
          line_no: 1,
          internal_sku: String(internalSku),
          fin_code: String(internalSku), // 使用商家SKU作为财务编码
          qty_sold: quantity,
          recv_customer: buyerPaid,
          recv_platform: orderAmount, // 平台收到的总金额
          extra_charge: shippingFee, // 额外收费（运费）
          fee_platform_comm: totalCommission, // 平台佣金
          fee_affiliate: 0, // 小红书没有联盟佣金
          fee_other: otherFees > 0 ? otherFees : 0, // 其他费用
          net_received: hasSettlement ? totalSettlement : (orderAmount - totalCommission - (otherFees > 0 ? otherFees : 0)),
          source_file: path.basename(orderFile),
          source_line: i + 2, // Excel 行索引（+2 是因为有表头和 0-索引）
        };

        // 验证金额闭环
        if (!checkAmountClosure(factRow)) {
          warnings.push(`订单 ${factRow.order_id} 的金额计算不闭环`);
        }

        factRows.push(factRow);
      } catch (err) {
        warnings.push(`处理订单 ${orderId} 时出错: ${err.message}`);
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
    // 小红书适配器不需要清理特殊的临时资源
  }
}

// 注册适配器
registerAdapter(new XiaohongshuAdapter());

// 导出适配器类型
export type { XiaohongshuAdapter };