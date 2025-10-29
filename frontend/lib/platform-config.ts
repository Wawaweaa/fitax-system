import type { Platform } from "./types"

export interface PlatformConfig {
  value: Platform
  label: string
  description: string
  requiredFiles: Array<{
    key: string
    label: string
    patterns: string[]
  }>
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    value: "xiaohongshu",
    label: "小红书",
    description: "小红书电商平台数据",
    requiredFiles: [
      {
        key: "settlement",
        label: "结算文件",
        patterns: ["settlement", "结算", "订单结算"],
      },
      {
        key: "orders",
        label: "订单文件",
        patterns: ["orders", "订单", "order"],
      },
    ],
  },
  {
    value: "douyin",
    label: "抖音",
    description: "抖音电商平台数据",
    requiredFiles: [
      {
        key: "settlement",
        label: "结算文件",
        patterns: ["settlement", "结算", "订单结算"],
      },
      {
        key: "orders",
        label: "订单文件",
        patterns: ["orders", "订单", "order"],
      },
    ],
  },
  {
    value: "wechat_video",
    label: "视频号",
    description: "微信视频号电商数据",
    requiredFiles: [
      {
        key: "settlement",
        label: "订单结算文件",
        patterns: ["settlement", "结算", "订单结算", "视频号"],
      },
    ],
  },
]

export function getPlatformConfig(platform: Platform): PlatformConfig | undefined {
  return PLATFORM_CONFIGS.find((config) => config.value === platform)
}
