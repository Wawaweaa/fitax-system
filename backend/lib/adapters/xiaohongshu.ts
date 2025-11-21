/**
 * 小红书平台适配器
 * 处理小红书导出的交易数据
 */
import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { PlatformAdapter, ProcessResult, ProcessParams, registerAdapter, checkAmountClosure } from './base';
import { FactRow, AggRow } from '../../../frontend/lib/types';
import { transformXiaohongshuToFact, XiaohongshuS1Input } from './xiaohongshu_core';

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

  // 字段映射 - 用于验证表头
  private readonly fieldMappings: Record<string, FieldMapping> = {
    // 订单明细字段映射 (Key should match Header in Excel)
    order: {
      '订单号': 'order_id',
      '规格ID': 'spec_id',
      '商家编码': 'sku_code',
      '商品总价(元)': 'total_amount',
      'SKU件数': 'quantity'
    },
    // 结算明细字段映射
    settlement: {
      '订单号': 'order_id',
      '规格ID': 'spec_id',
      '结算时间': 'settlement_time'
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

    // 验证表头 - 使用核心转换需要的关键字段进行验证
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
      // Allow empty data but warn? Or strict fail?
      // Let's fail strictly if no rows.
      throw new Error(`${fileType}文件没有数据`);
    }

    const firstRow = data[0];
    const presentFields = Object.keys(mapping).filter(field => field in firstRow);

    if (presentFields.length === 0) {
        const expectedFields = Object.keys(mapping).join(', ');
        throw new Error(`${fileType}文件似乎不匹配，缺少预期字段 (如: ${expectedFields})`);
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
    const { orderData, settlementData } = await this.preprocess(params);

    console.log('[xhs-adapter] preprocess result', {
      settlementRows: settlementData.length,
      orderRows: orderData.length,
      settlementHeaders: Object.keys(settlementData[0] || {}),
      orderHeaders: Object.keys(orderData[0] || {}),
    });

    // 使用核心转换器处理
    const input: XiaohongshuS1Input = {
      settlementRows: settlementData,
      orderRows: orderData
    };

    const warnings: string[] = [];
    let factRows: FactRow[] = [];

    try {
      const rawFactRows = transformXiaohongshuToFact(input);

      console.log('[xhs-adapter] after transform', {
        factRows: rawFactRows.length,
      });
      
      // 过滤并补充元数据
      factRows = rawFactRows.filter(row => {
          if (row.year !== year || row.month !== month) {
              warnings.push(`Row ignored: Date ${row.year}-${row.month} does not match job period ${year}-${month}`);
              return false;
          }
          return true;
      }).map(row => ({
        ...row,
        platform,
        upload_id: uploadId,
        job_id: params.jobId || '',
        record_count: 1
      }));

    } catch (err: any) {
      throw new Error(`Core transformation failed: ${err.message}`);
    }

    // Check amount closure for each row
    factRows.forEach(row => {
        if (!checkAmountClosure(row)) {
             warnings.push(`Amount mismatch for Order ${row.order_id}: Net ${row.net_received} != I+J+K-L-M-N`);
        }
    });

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
      
      // qty_sold_sum = Σ qty_sold
      summary.qty_sold_sum += row.qty_sold;
      
      // income_total_sum = Σ (recv_customer + recv_platform + extra_charge)
      summary.income_total_sum += (row.recv_customer + row.recv_platform + row.extra_charge);
      
      // fee_platform_comm_sum = Σ fee_platform_comm
      summary.fee_platform_comm_sum += row.fee_platform_comm;
      
      // fee_other_sum = Σ (fee_affiliate + fee_other)
      summary.fee_other_sum += (row.fee_affiliate + row.fee_other);
      
      // net_received_sum = Σ net_received
      summary.net_received_sum += row.net_received;
      
      summary.record_count! += 1;
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

// 导出适配器类 (for testing)
export { XiaohongshuAdapter };
