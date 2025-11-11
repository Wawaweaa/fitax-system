/**
 * 平台适配器基础接口
 * 定义了所有平台适配器必须实现的方法
 */
import { FactRow, AggRow } from '../../../frontend/lib/types';

/**
 * 平台适配器处理结果
 */
export interface ProcessResult {
  factRows: FactRow[];
  aggRows: AggRow[];
  warnings: string[];
}

/**
 * 平台适配器处理参数
 */
export interface ProcessParams {
  platform: string;
  uploadId: string;
  year: number;
  month: number;
  files: string[];
  jobId: string;
}

/**
 * 平台适配器接口
 */
export interface PlatformAdapter {
  /**
   * 平台编码
   */
  readonly platformCode: string;

  /**
   * 平台显示名称
   */
  readonly platformName: string;

  /**
   * 平台支持的文件类型
   */
  readonly supportedFileTypes: string[];

  /**
   * 平台要求的文件
   */
  readonly requiredFiles: {
    key: string;
    name: string;
    description: string;
    patterns: string[];
    required: boolean;
  }[];

  /**
   * 处理平台数据
   * @param params 处理参数
   * @returns 处理结果
   */
  process(params: ProcessParams): Promise<ProcessResult>;

  /**
   * 检查输入是否有效
   * @param params 处理参数
   * @returns 是否有效，如果无效则返回错误消息
   */
  validateInput(params: ProcessParams): Promise<{ valid: boolean; message?: string }>;

  /**
   * 预处理文件
   * @param params 处理参数
   * @returns 预处理结果
   */
  preprocess?(params: ProcessParams): Promise<any>;

  /**
   * 清理临时资源
   * @param params 处理参数
   */
  cleanup?(params: ProcessParams): Promise<void>;
}

// 适配器注册表
const adapters: Record<string, PlatformAdapter> = {};

/**
 * 注册平台适配器
 * @param adapter 平台适配器
 */
export function registerAdapter(adapter: PlatformAdapter): void {
  adapters[adapter.platformCode] = adapter;
}

/**
 * 获取平台适配器
 * @param platformCode 平台编码
 * @returns 平台适配器
 */
export function getAdapter(platformCode: string): PlatformAdapter {
  const adapter = adapters[platformCode];
  if (!adapter) {
    throw new Error(`Platform adapter not found: ${platformCode}`);
  }
  return adapter;
}

/**
 * 获取所有已注册的平台适配器
 * @returns 平台适配器列表
 */
export function getAllAdapters(): PlatformAdapter[] {
  return Object.values(adapters);
}

/**
 * 计算金额是否闭合的工具方法
 * @param row 行数据
 * @param tolerance 容忍度（精度误差）
 * @returns 是否闭合
 */
export function checkAmountClosure(row: FactRow, tolerance = 0.01): boolean {
  const { recv_customer, recv_platform, extra_charge, fee_platform_comm, fee_affiliate, fee_other, net_received } = row;

  const calculatedNetReceived = recv_platform + extra_charge - fee_platform_comm - fee_affiliate - fee_other;
  const diff = Math.abs(calculatedNetReceived - net_received);

  return diff <= tolerance;
}