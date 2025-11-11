# Fitax - 多平台结算系统

Fitax是一个用于处理多平台电商结算数据的系统，支持小红书、抖音和微信视频号等平台的结算数据导入、处理、查询和导出。

## 项目结构

```
frontend/               # Next.js前端项目
  ├── app/              # Next.js App Router
  │   ├── api/          # API路由
  │   │   ├── export/   # 导出API
  │   │   ├── job/      # 作业状态API
  │   │   ├── preview/  # 预览API
  │   │   ├── process/  # 处理API
  │   │   └── upload/   # 上传API
  │   └── ...           # 前端页面
  ├── lib/              # 业务逻辑库
  │   ├── config.ts     # 配置管理
  │   ├── datasets.ts   # 数据集管理
  │   ├── duckdb.ts     # DuckDB查询
  │   ├── jobs.ts       # 作业管理
  │   ├── queue/        # 队列抽象
  │   ├── storage/      # 存储抽象
  │   ├── types.ts      # 类型定义
  │   ├── uploads.ts    # 上传管理
  │   └── utils.ts      # 工具函数
  ├── worker/           # Worker进程
  │   ├── adapters/     # 平台适配器
  │   │   ├── base.ts   # 适配器基类
  │   │   ├── xiaohongshu.ts  # 小红书适配器
  │   │   ├── douyin.ts # 抖音适配器
  │   │   └── wechat_video.ts # 微信视频号适配器
  │   ├── processor.ts  # 数据处理器
  │   ├── index.ts      # Worker入口
  │   └── start.ts      # Worker启动脚本
  ├── scripts/          # 实用脚本
  │   └── test-worker.ts # Worker测试脚本
  └── tests/            # 测试文件
      └── samples/      # 样例数据
```

## 系统架构

Fitax采用现代化的Web应用架构：

1. **前端**: 使用Next.js App Router构建的React应用程序
2. **API**: Next.js API Routes提供的RESTful API
3. **Worker**: 独立的Node.js进程，负责数据处理和Parquet生成
4. **存储抽象**: 支持本地文件系统、S3和阿里OSS
5. **队列抽象**: 支持内存队列、Upstash Redis、AWS SQS和阿里MNS
6. **数据库**: 使用DuckDB进行高性能本地查询
7. **数据格式**: 使用Parquet格式高效存储和查询数据

## 主要功能

1. **文件上传**: 支持CSV和Excel格式的结算文件上传，自动去重
2. **数据处理**: 自动解析不同平台的结算文件，生成统一格式
3. **数据合并**: 支持合并(merge)和替换(replace)两种处理模式
4. **数据查询**: 支持按平台、年月、SKU查询数据
5. **数据导出**: 支持CSV和Excel格式导出，提供云存储签名链接

## 配置

系统支持多种配置选项，通过环境变量设置：

```sh
# 基本配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
FITAX_ENV=development

# 存储配置
FITAX_STORAGE_DRIVER=local       # local, s3, alioss
FITAX_S3_BUCKET=fitax-bucket
FITAX_S3_REGION=us-west-1
FITAX_S3_ACCESS_KEY=your-access-key
FITAX_S3_SECRET_KEY=your-secret-key

# 队列配置
FITAX_QUEUE_DRIVER=inmemory      # inmemory, upstash, sqs, mns
FITAX_UPSTASH_URL=your-upstash-url
FITAX_UPSTASH_TOKEN=your-upstash-token

# 数据库配置
FITAX_DUCKDB_PATH=data/fitax.duckdb
```

## 使用方法

### 安装依赖

```sh
cd frontend
npm install
```

### 启动开发服务器

```sh
# 启动前端
npm run dev

# 启动Worker
npm run worker:dev
```

### 生产环境部署

```sh
# 构建前端
npm run build

# 启动前端
npm run start

# 启动Worker
npm run worker
```

### 测试

```sh
# 运行单元测试
npm test

# 监视模式运行测试
npm run test:watch

# 运行适配器独立测试
npm run test:adapter

# 运行微信视频号适配器测试
npm run test:wechat-video
```

#### 测试目录结构

```
tests/
├── fixtures/              # 测试固定数据
│   └── expected/          # 预期输出数据（金样）
│       └── wechat_video/  # 微信视频号金样
├── samples/               # 测试样本数据
│   ├── wechat_video_sample.csv
│   ├── xiaohongshu_sample.csv
│   └── douyin_sample.csv
└── vitest/                # Vitest测试
    ├── adapters/          # 适配器测试
    │   └── wechat_video.test.ts  # 微信视频号适配器测试
    └── e2e/               # 端到端测试
        └── wechat_video.e2e.test.ts  # 微信视频号E2E测试
```

## 数据流程

1. **上传文件**: 用户上传结算文件，计算SHA256哈希去重
2. **提交处理**: 用户选择平台、年月和处理模式，提交作业
3. **队列处理**: Worker从队列中获取作业，解析文件
4. **数据处理**: 根据平台类型调用适配器，生成标准格式数据
5. **Parquet生成**: 生成事实表和聚合表的Parquet文件
6. **有效视图更新**: 更新数据集的有效视图
7. **数据查询**: 用户查询处理后的数据
8. **数据导出**: 用户导出数据为CSV或Excel格式

## API接口

### 上传API

```
POST /api/upload
```

上传结算文件，返回上传ID和去重信息。

### 处理API

```
POST /api/process
```

提交处理作业，处理上传的文件，返回作业ID。

### 作业状态API

```
GET /api/job/:jobId
```

查询作业状态和处理进度。

### 预览API

```
GET /api/preview?platform=xiaohongshu&year=2024&month=10&view=fact
```

查询处理后的数据，支持行级数据(fact)和聚合数据(agg)。

### 导出API

```
GET /api/export?platform=xiaohongshu&year=2024&month=10&format=xlsx
```

导出数据为CSV或Excel格式。

## 平台支持

系统当前支持以下电商平台的结算数据：

1. **小红书(xiaohongshu)**: 小红书电商平台
2. **抖音(douyin)**: 抖音电商平台
3. **微信视频号(wechat_video)**: 微信视频号电商平台

每个平台都有专门的适配器，用于将平台特定的结算数据转换为统一格式。

### 微信视频号适配器

微信视频号适配器(`WechatVideoAdapter`)实现了以下功能：

1. **数据解析**：支持解析CSV和Excel格式的微信视频号结算文件
2. **字段映射**：将微信视频号特有的字段名映射到系统标准字段
3. **三段式数量处理**：按照规则处理商品数量（>0→原值；-30~0→0；≤-30→-1）
4. **行键和哈希生成**：生成唯一的行键和内容哈希，用于数据合并和比对
5. **金额恒等式检验**：验证`I+J+K-L-M-N = O`公式成立

测试文件位于`demo-data`目录：

- `demo-1024-视频号模型_规则样例_251026.xlsx`：模型样例文件
- `demo-视频号订单结算8月_样例_251026.xlsx`：订单结算样例文件

单元测试和E2E测试确保适配器正确处理所有边缘情况。

## 数据模型

系统使用两种主要数据模型：

### 事实表(FactRow)

15列标准字段，包括订单号、商品编码、数量、金额等详细信息。

### 聚合表(AggRow)

按SKU汇总的数据，包括销售数量、收入合计、各类费用和应到账金额。

## 贡献

欢迎提交Issue和Pull Request，一起改进Fitax系统！