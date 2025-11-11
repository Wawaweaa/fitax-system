/**
 * 示例平台适配器
 * 用于测试和示例用途
 */
import fs from 'fs/promises';
import path from 'path';
import { PlatformAdapter, ProcessResult, ProcessParams, registerAdapter } from './base';
import { FactRow, AggRow } from '../../../frontend/lib/types';

/**
 * 示例平台适配器
 */
class ExampleAdapter implements PlatformAdapter {
  // 平台标识
  readonly platformCode = 'example';

  // 平台名称
  readonly platformName = '示例平台';

  // 支持的文件类型
  readonly supportedFileTypes = ['.csv', '.xlsx', '.json'];

  // 所需文件定义
  readonly requiredFiles = [
    {
      key: 'main',
      name: '销售数据',
      description: '包含订单和销售数据的主文件',
      patterns: ['*order*.csv', '*sales*.csv', '*order*.xlsx', '*sales*.xlsx'],
      required: true,
    },
    {
      key: 'fee',
      name: '费用数据',
      description: '包含平台费用和佣金数据的文件',
      patterns: ['*fee*.csv', '*commission*.csv', '*fee*.xlsx', '*commission*.xlsx'],
      required: false,
    },
  ];

  /**
   * 验证输入文件
   * @param params 处理参数
   * @returns 验证结果
   */
  async validateInput(params: ProcessParams): Promise<{ valid: boolean; message?: string; }> {
    const { files } = params;

    // 检查是否有文件
    if (!files || files.length === 0) {
      return {
        valid: false,
        message: '没有提供文件',
      };
    }

    // 检查文件类型是否支持
    const hasValidFile = files.some(file => {
      const ext = path.extname(file).toLowerCase();
      return this.supportedFileTypes.includes(ext);
    });

    if (!hasValidFile) {
      return {
        valid: false,
        message: `不支持的文件类型，支持的类型：${this.supportedFileTypes.join(', ')}`,
      };
    }

    // 检查是否有主文件
    const hasMainFile = files.some(file => {
      const filename = path.basename(file).toLowerCase();
      return this.requiredFiles[0].patterns.some(pattern => {
        // 简单的通配符匹配
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(filename);
      });
    });

    if (!hasMainFile) {
      return {
        valid: false,
        message: `缺少主文件 (${this.requiredFiles[0].name})，文件名应匹配：${this.requiredFiles[0].patterns.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * 处理文件
   * @param params 处理参数
   * @returns 处理结果
   */
  async process(params: ProcessParams): Promise<ProcessResult> {
    const { platform, uploadId, year, month, files } = params;

    // 模拟处理延迟
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 生成测试数据
    const factRows: FactRow[] = [];
    const aggRows: AggRow[] = [];

    // 为每个SKU创建测试数据
    const skus = ['TS001', 'TS002', 'TS003', 'TS004', 'TS005'];

    // 生成事实表数据
    for (let i = 0; i < 100; i++) {
      const skuIndex = i % skus.length;
      const orderId = `ORD-${year}${month.toString().padStart(2, '0')}-${i.toString().padStart(4, '0')}`;

      factRows.push({
        platform,
        upload_id: uploadId,
        year,
        month,
        order_id: orderId,
        line_count: Math.floor(Math.random() * 3) + 1,
        line_no: 1,
        internal_sku: skus[skuIndex],
        fin_code: `FIN-${skus[skuIndex]}`,
        qty_sold: Math.floor(Math.random() * 5) + 1,
        recv_customer: parseFloat((Math.random() * 100 + 50).toFixed(2)),
        recv_platform: parseFloat((Math.random() * 100 + 50).toFixed(2)),
        extra_charge: parseFloat((Math.random() * 5).toFixed(2)),
        fee_platform_comm: parseFloat((Math.random() * 15).toFixed(2)),
        fee_affiliate: parseFloat((Math.random() * 5).toFixed(2)),
        fee_other: parseFloat((Math.random() * 3).toFixed(2)),
        net_received: 0, // 将被计算
        source_file: path.basename(files[0]),
        source_line: i + 1,
      });
    }

    // 计算净收入并创建汇总数据
    const skuSummary: Record<string, AggRow> = {};

    for (const row of factRows) {
      // 计算净收入
      row.net_received = parseFloat((
        row.recv_platform +
        row.extra_charge -
        row.fee_platform_comm -
        row.fee_affiliate -
        row.fee_other
      ).toFixed(2));

      // 汇总数据
      if (!skuSummary[row.internal_sku]) {
        skuSummary[row.internal_sku] = {
          platform,
          upload_id: uploadId,
          year,
          month,
          internal_sku: row.internal_sku,
          qty_sold_sum: 0,
          income_total_sum: 0,
          fee_platform_comm_sum: 0,
          fee_other_sum: 0,
          net_received_sum: 0,
          record_count: 0,
        };
      }

      const summary = skuSummary[row.internal_sku];
      summary.qty_sold_sum += row.qty_sold;
      summary.income_total_sum += row.recv_platform;
      summary.fee_platform_comm_sum += row.fee_platform_comm;
      summary.fee_other_sum += row.fee_other;
      summary.net_received_sum += row.net_received;
      summary.record_count += 1;
    }

    // 转换汇总数据为数组并四舍五入
    for (const key in skuSummary) {
      const summary = skuSummary[key];
      summary.income_total_sum = parseFloat(summary.income_total_sum.toFixed(2));
      summary.fee_platform_comm_sum = parseFloat(summary.fee_platform_comm_sum.toFixed(2));
      summary.fee_other_sum = parseFloat(summary.fee_other_sum.toFixed(2));
      summary.net_received_sum = parseFloat(summary.net_received_sum.toFixed(2));
      aggRows.push(summary);
    }

    // 返回结果
    return {
      factRows,
      aggRows,
      warnings: ['这是示例适配器生成的数据，仅用于测试目的。'],
    };
  }
}

// 注册适配器
registerAdapter(new ExampleAdapter());

// 导出适配器类型（用于测试和扩展）
export type { ExampleAdapter };