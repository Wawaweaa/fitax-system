/**
 * Excel 文件处理工具
 */
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs/promises';
import { storage } from './storage';
import { config } from './config';
import { generateId, ensureDir } from './utils';

/**
 * 将 JSON 数据导出为 Excel 文件
 * @param data 数据数组
 * @param options 导出选项
 * @returns 生成的文件路径
 */
export async function exportToExcel(
  data: any[],
  options: {
    sheetName?: string;
    fileName?: string;
    dirPath?: string;
  } = {}
): Promise<string> {
  // 创建工作簿
  const workbook = XLSX.utils.book_new();

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(data);

  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');

  // 确定文件路径
  const dirPath = options.dirPath || path.join(process.cwd(), 'exports');
  await ensureDir(dirPath);

  // 生成文件名
  const fileName = options.fileName || `export_${generateId()}.xlsx`;
  const filePath = path.join(dirPath, fileName);

  // 写入 Excel 文件
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await fs.writeFile(filePath, buffer);

  return filePath;
}

/**
 * 将 Excel 文件上传到对象存储
 * @param filePath 本地文件路径
 * @param objectKey 对象键
 * @returns 预签名下载 URL
 */
export async function uploadExcelToStorage(
  filePath: string,
  objectKey: string
): Promise<string> {
  // 读取文件
  const fileData = await fs.readFile(filePath);

  // 上传到存储
  await storage().putObject(objectKey, fileData, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // 生成预签名下载 URL
  return storage().getPresignedDownloadUrl(objectKey, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    expiresIn: config().signedUrlExpiry,
    fileName: path.basename(filePath),
  });
}

/**
 * 读取并解析 Excel 文件
 * @param filePath 文件路径
 * @param options 解析选项
 * @returns 解析后的数据
 */
export async function readExcel(
  filePath: string,
  options: {
    sheetName?: string;
    header?: number;
  } = {}
): Promise<any[]> {
  // 读取文件
  const fileData = await fs.readFile(filePath);

  // 解析工作簿
  const workbook = XLSX.read(fileData);

  // 获取工作表名称
  const sheetName = options.sheetName || workbook.SheetNames[0];

  // 解析工作表
  const worksheet = workbook.Sheets[sheetName];

  // 转换为 JSON
  return XLSX.utils.sheet_to_json(worksheet, {
    header: options.header,
    defval: null, // 将空单元格转换为 null
  });
}

/**
 * 读取并解析对象存储中的 Excel 文件
 * @param objectKey 对象键
 * @param options 解析选项
 * @returns 解析后的数据
 */
export async function readExcelFromStorage(
  objectKey: string,
  options: {
    sheetName?: string;
    header?: number;
  } = {}
): Promise<any[]> {
  // 从存储获取对象
  const fileData = await storage().getObject(objectKey);

  // 解析工作簿
  const workbook = XLSX.read(fileData);

  // 获取工作表名称
  const sheetName = options.sheetName || workbook.SheetNames[0];

  // 解析工作表
  const worksheet = workbook.Sheets[sheetName];

  // 转换为 JSON
  return XLSX.utils.sheet_to_json(worksheet, {
    header: options.header,
    defval: null, // 将空单元格转换为 null
  });
}