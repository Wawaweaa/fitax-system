# 技术方案与架构说明

## 1. 技术栈
- 前端：Next.js 14（App Router）、React 18、Tailwind/Shadcn UI。
- 后端：Next.js API Routes（Node runtime）+ DuckDB（本地开发）；生产时改为 Worker + Parquet（详见 G/H）。
- 文件：SheetJS 读写 `.xlsx`；本地 `uploads/<uploadId>/` 用于 dev-local。
- 语言/工具：TypeScript、nanoid、zod（预留）、Docker（Worker）。

## 2. 组件划分
```
├─ app/                      # 前端页面与 API
│  ├─ page.tsx               # 上传页
│  ├─ preview/page.tsx       # 预览页
│  └─ api/                   # Upload/Process/Preview/Export
├─ adapters/                 # 平台 S0/S1
│  ├─ base.ts                # PlatformAdapter 接口与注册
│  ├─ xhs.ts
│  ├─ douyin.ts
│  └─ wechat_video.ts
├─ lib/
│  ├─ duckdb.ts              # dev-local: DuckDB 连接
│  ├─ storage.ts             # Storage 抽象 (S3/AliOSS)
│  ├─ queue.ts               # Queue 抽象 (Redis/SQS/MNS)
│  ├─ xlsx.ts                # SheetJS 工具
│  └─ util.ts                # 存文件、ID、字符串清洗
├─ worker/
│  ├─ index.ts               # 队列 Worker 入口
│  └─ Dockerfile             # Cloud 运行镜像
├─ sql/schema.sql            # staging/fact/agg DDL（dev-local）
├─ docs/                     # 文档
└─ expected/                 # 金样
```

## 3. 数据流（dev-local）
1. `/api/upload`：验证平台、保存文件到 `uploads/`。
2. `/api/process`：调用 `adapter.normalize` → `adapter.compute` → 写 `fact_settlement` + `agg_month_sku`。
3. `/api/preview`：根据视图查询 DuckDB 表。
4. `/api/export`：导出当前筛选条件至 xlsx。

## 4. 数据流（staging-intl / prod-cn）
1. 前端请求 `/api/upload-signed` 获取预签名 URL（Storage driver 决定 S3 或 OSS）。
2. 浏览器直传至对象存储 `raw/<uploadId>/...`。
3. `/api/process` 将任务写入队列（Queue driver）。
4. Worker 取任务：从对象存储读取 → 执行 S0/S1 → 生成 `parquet/`、`exports/` → 更新元数据（Postgres/Log）。
5. `/api/preview`：查询 DuckDB 连对象存储（httpfs/s3），或直接读取 Parquet。
6. `/api/export`：返回签名下载链接。

## 5. 适配器职责
- `normalize`: 读取原始 Excel（dev-local: 本地文件；云环境：从 `raw/` 下载）→ 清洗 → 写 staging（dev-local) 或直接产出中间 Parquet。
- `compute`: join 维表 → 计算 A–O → 写 `fact_settlement`（dev-local: DuckDB；云环境：写入 `parquet/` + 更新 metadata）。
- 平台差异封装在适配器内部。

## 6. 存储与队列抽象
### Storage 接口
```ts
interface Storage {
  putObject(key: string, body: Buffer | Readable, opts?: PutOptions): Promise<void>;
  getPresignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  getPresignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  list(prefix: string): Promise<string[]>;
}
```
- 驱动：`S3Storage`（aws-sdk v3）、`AliOSSStorage`（ali-oss）。

### Queue 接口
```ts
interface Queue {
  enqueue(payload: Payload, opts?: EnqueueOptions): Promise<void>;
  reserve(opts?: ReserveOptions): Promise<Job | null>;
  ack(id: string): Promise<void>;
  fail(id: string, err: Error): Promise<void>;
}
```
- 驱动：`RedisQueue`（Upstash Redis Streams）、`SQSQueue`、`MNSQueue`。

## 7. Worker 架构
- 单一 Docker 镜像，包含 Node.js、DuckDB CLI/JS、httpfs/s3 扩展。
- 通过 ENV 配置 Storage/Queue/Database。
- 流程：
  1. `reserve` -> 获取任务。
  2. 下载原始文件（直读对象存储）。
  3. 执行 S0/S1，生成 Parquet（fact_settlement、agg_month_sku）。
  4. 上传结果至 `parquet/` & `exports/`。
  5. 写 metadata（Postgres）。
  6. `ack`，如失败 `fail` 并记录错误详情。

## 8. 数据形态
- 原始：`raw/<platform>/<uploadId>/<file>.xlsx`
- S0 中间（可选）：`staging/<platform>/<uploadId>/...`
- 真相：`parquet/platform=<name>/year=<yyyy>/month=<mm>/fact.parquet`
- 聚合：`parquet/.../agg.parquet`
- 导出：`exports/<platform>/<year>/<month>/<timestamp>.xlsx`
- DuckDB 开发：本地 `./data/app.db`；云端使用 DuckDB 连接对象存储。

## 9. 环境部署
- **dev-local**：`npm run dev` + `duckdb` 文件。
- **staging-intl**：
  - 前端 Vercel；API 只做签名与查询。
  - Worker 部署于 Fly/Render/DO（Docker）。
  - Storage: AWS S3；Queue: Upstash/SQS；Metadata: Postgres (Neon/Supabase)。
- **prod-cn**：
  - 前端部署 OSS 静态 + CDN（或 SSR via SAE/函数计算）。
  - Worker 部署 SAE/ECS/ACK。
  - Storage: 阿里云 OSS；Queue: MNS；Metadata: ApsaraDB。

## 10. CI/CD
- GitHub Actions：
  - `build-frontend`: push 到 main → 部署 Vercel。
  - `build-worker`: 构建 Docker 镜像 → 推送 Registry。
  - `deploy-staging`: 自动触发，运行 E2E（含金样 diff）。
  - `deploy-prod`: 手动触发，包含审批流程；灰度 10% → 50% → 100%。

## 11. 监控与日志
- staging-intl：Sentry（FE/BE）、Logtail、Datadog。
- prod-cn：阿里云 SLS、云监控。
- 指标：
  - 上传成功率、队列待处理数、Worker 处理成功率/平均时长、失败率、导出成功率、P95 等。
  - 告警：队列 backlog、处理失败率、导出失败率、直传失败。

## 12. 安全与合规
- 文件白名单（.xlsx）、大小 50MB、速率限制。
- 仅使用签名 URL/STS；禁止公开写权限。
- 导出值化、防 CSV 注入（输出 `'` 前缀防公式）。
- prod-cn：ICP 备案、域名证书、同地域部署避免跨境。

## 13. 迁移策略
- 代码层：Storage/Queue driver、Worker 容器化、Parquet 为中心、直传签名流程立即实现。
- 数据：S3 → OSS 同步，校验对象数量与字节总量。
- 部署：先在 staging-intl 汲取指标 → 构建 prod-cn → shadow → 双写 → 灰度 → 切 DNS。

