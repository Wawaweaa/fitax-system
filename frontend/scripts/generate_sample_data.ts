/**
 * 生成微信视频号样本数据的测试脚本
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import * as XLSX from 'xlsx';

// 主函数
async function main() {
  try {
    console.log('开始生成微信视频号样本数据...');

    // 创建测试数据数组
    const data = [];

    // 添加标题行
    const headers = [
      '订单号', '商品行数', '行号', '商品编码', '财务编码',
      '数量', '实收金额', '平台补贴', '附加费用',
      '平台佣金', '分销服务费', '其他费用', '结算金额'
    ];

    data.push(headers);

    // 生成10条测试数据
    for (let i = 1; i <= 10; i++) {
      const orderNumber = `ORD${String(i).padStart(6, '0')}`;
      const skuCode = `SKU${String(i).padStart(5, '0')}`;
      const finCode = `FIN${String(i).padStart(5, '0')}`;
      const qty = Math.floor(Math.random() * 5) + 1;

      // 资金数据
      const recvCustomer = Math.round(Math.random() * 10000) / 100; // 0-100元
      const recvPlatform = Math.round(Math.random() * 2000) / 100; // 0-20元
      const extraCharge = Math.round(Math.random() * 500) / 100; // 0-5元

      const feePlatform = Math.round(Math.random() * 1000) / 100; // 0-10元
      const feeAffiliate = Math.round(Math.random() * 500) / 100; // 0-5元
      const feeOther = Math.round(Math.random() * 200) / 100; // 0-2元

      // 计算结算金额
      const settlement = recvCustomer + recvPlatform + extraCharge - feePlatform - feeAffiliate - feeOther;

      // 添加数据行
      data.push([
        orderNumber, 1, 1, skuCode, finCode,
        qty, recvCustomer, recvPlatform, extraCharge,
        feePlatform, feeAffiliate, feeOther,
        Math.round(settlement * 100) / 100  // 保留两位小数
      ]);
    }

    // 创建工作表
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "视频号结算数据");

    // 输出文件
    const filePath = path.join(process.cwd(), 'data', 'temp', 'wechat_video_sample_data.xlsx');

    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 写入文件
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await fs.writeFile(filePath, buffer);

    console.log(`样本数据已生成: ${filePath}`);
    console.log(`已生成 ${data.length - 1} 条测试数据`);
  } catch (err) {
    console.error('生成样本数据失败:', err);
    process.exit(1);
  }
}

// 执行主函数
main().catch(console.error);