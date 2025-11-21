
import * as fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { PlatformAdapter, ParseOptions, ParseResult } from './base';
import { FactRow } from '../../lib/types';
import { transformXiaohongshuToFact, XiaohongshuS1Input } from '../../../backend/lib/adapters/xiaohongshu_core';
// import { checkAmountClosure } from '../../lib/utils';

export class XiaohongshuAdapter implements PlatformAdapter {
  readonly platform = 'xiaohongshu';

  async parseFiles(
    settlementFilePath: string,
    ordersFilePath: string | null,
    options: ParseOptions
  ): Promise<ParseResult> {
    const result: ParseResult = { factRows: [], warnings: [] };

    if (!ordersFilePath) {
      throw new Error('小红书需要同时提供结算明细和订单明细文件');
    }

    try {
      // 读取结算明细
      const settlementBuf = await fs.readFile(settlementFilePath);
      const settlementWb = XLSX.read(settlementBuf);
      const settlementSheet = settlementWb.Sheets[settlementWb.SheetNames[0]];
      const settlementRows = XLSX.utils.sheet_to_json(settlementSheet, { defval: null }) as Record<string, any>[];

      // 读取订单明细
      const ordersBuf = await fs.readFile(ordersFilePath);
      const ordersWb = XLSX.read(ordersBuf);
      const ordersSheet = ordersWb.Sheets[ordersWb.SheetNames[0]];
      const orderRows = XLSX.utils.sheet_to_json(ordersSheet, { defval: null }) as Record<string, any>[];

      console.log('[xhs-worker-adapter] raw rows', {
        settlementRows: settlementRows.length,
        orderRows: orderRows.length,
      });

      // 调用核心转换器
      const input: XiaohongshuS1Input = { settlementRows, orderRows };
      const coreFactRows = transformXiaohongshuToFact(input);

      // 过滤并转换
      const factRows: FactRow[] = coreFactRows
        .filter(row => row.year === options.year && row.month === options.month)
        .map((row, idx) => ({
          ...row,
          // source 元数据留给 processor 去补充 row_key/row_hash/user_id 等
          // 核心转换器返回的 FactRow 包含标准 15 字段和一些元数据，我们保留它们
          // 但要注意 source_file 等可能需要覆盖
          source_file: path.basename(settlementFilePath),
          source_line: idx + 2,
        }));

      console.log('[xhs-worker-adapter] after transform', {
        factRows: factRows.length,
      });

      result.factRows = factRows;

      // 简单金额闭环检查 (Temporarily disabled due to missing utility import in Worker context)
      /*
      factRows.forEach(row => {
        if (!checkAmountClosure(row)) {
           result.warnings.push(`Amount mismatch for Order ${row.order_id}: Net ${row.net_received} != I+J+K-L-M-N`);
        }
      });
      */

    } catch (err: any) {
       throw new Error(`Xiaohongshu parsing failed: ${err.message}`);
    }

    return result;
  }
}
