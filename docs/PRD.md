# 详细需求文档（PRD）

## 1. 用户故事与流程
- **上传**：运营选择平台 → 上传平台原始 `.xlsx`（仅值、≤50MB） → 校验扩展名/MIME → 校验表头（参考 `demo-表头说明_251028.xlsx`）→ 生成 `upload_id`。
- **处理**：触发 `/api/process` → 平台适配器执行 S0 归一化（字段映射、空白处理、时区统一、注释行过滤） → S1 统一计算 A–O 15 列 → 写入 `fact_settlement` & `agg_month_sku` → 返回行数与 warnings。
- **预览**：默认显示行级 A–O 视图，可切换到「汇总(月×SKU)」视图；筛选项包括平台（多选）、年份、月份、SKU 关键字；展示合计行和 KPI 信息。
- **导出**：调用 `/api/export?view=fact|agg`，输出当前筛选结果的 `.xlsx` 文件（命名：`平台名+年月+结算数据确认_时间戳.xlsx`）。
- **错误提示**：全部以中文弹窗呈现（后台日志记录英文 key），覆盖上传类型错误、文件超限、缺 sheet、字段解析失败、主键冲突、金额守恒失败等场景。

## 2. 数据契约
### 2.1 S0 标准字段
`order_id`, `spec_id`, `settle_ts`, `item_qty`, `recv_customer`, `platform_coupon`, `platform_ship_subsidy`, `freight`, `platform_commission`, `affiliate_commission`, `merchant_code`。若缺失则置 NULL，并记录 warning。时区统一 Asia/Shanghai。

### 2.2 S1 统一字段（A–O）
| 列 | 字段 | 含义 | 单位 | 税口径 | 备注 |
|----|------|------|------|--------|------|
|A|year|结算年|INT|含税|`EXTRACT(YEAR settle_ts)`|
|B|month|结算月|INT|含税|`EXTRACT(MONTH settle_ts)`|
|C|order_id|订单号|TEXT|—|平台清洗后订单号|
|D|line_count|订单行数|INT|—|XHS/抖音 NULL，视频号计算|
|E|line_no|订单序位|INT|—|XHS/抖音 NULL，视频号计算|
|F|internal_sku|平台商家编码|TEXT|—|缺失时记录 warning|
|G|fin_code|财务核算编码|TEXT|—|通常为 F 的前缀|
|H|qty_sold|销售数量|NUMERIC|—|三段式：>0→qty；-30~0→0；≤-30→-1|
|I|recv_customer|应收客户|CNY|含税|平台原口径|
|J|recv_platform|应收平台|CNY|含税|优惠+补贴|
|K|extra_charge|价外收费|CNY|含税|运费≤0 取原值，>0 均分|
|L|fee_platform_comm|平台佣金|CNY|含税|正数扣减|
|M|fee_affiliate|分销佣金|CNY|含税|正数扣减|
|N|fee_other|其它费用|CNY|含税|默认 0，可扩展|
|O|net_received|应到账金额|CNY|含税|I+J+K-L-M-N|

- 主键：`(platform, order_id, spec_id, line_no)`；line_no NULL 时需确保 `(platform, order_id, spec_id)` 唯一。
- 外键：`internal_sku → product_dim`，`platform → platform_dim`，`year/month → calendar_dim`。
- 金额口径：沿用平台原字段含税/押金定义，未做额外调整，长期目标待定。

## 3. 平台适配策略
- **小红书**：需两个原始表；join `(order_id,spec_id)` → 商家编码；运费正值均分；D/E 输出 NULL。
- **抖音**：过滤结算表第二行注释；A/B/F 列去不可见空白；清洗键后 join；D/E 输出 NULL。
- **视频号**：单表；`SKU编码(自定义)` 直接作为 F；按附件公式计算 D/E/H/I/J/K/L/M/N/O。

## 4. API 规格
- `POST /api/upload`：form-data（platform + 必要文件）；返回 `uploadId`; 400/413/415/422 处理异常。
- `POST /api/process`：JSON `{platform, uploadId, year, month}`；返回 `{factRows, aggRows, warnings[]}`；404/422/500。
- `GET /api/preview`：`platform[]`, `year`, `month`, `sku`, `page`, `pageSize`, `view`；返回 `{data, pagination}`；400/416/500。
- `GET /api/export`：同 preview 参数 + `view`；返回 `.xlsx`；400/404/500。

## 5. 前端视图
- 上传页：平台下拉、文件上传控件、状态提示、错误弹窗。
- 预览页：视图切换（行级默认、汇总可选）、筛选器、表格（行级显示 A–O 全列）、粘性表头、虚拟滚动、合计行；导出按钮显示当前视图类型。

## 6. 校验与守恒
- 主键唯一；金额守恒（订单级 net_received 与原账单一致）；运费分摊守恒；退款数量逻辑；关键字段非空率 ≥99%；异常（含宏、缺列、主键冲突、金额闭合失败）需中止并提示。

## 7. 非目标
账号体系、队列/异步、云存储、监控、税率换算、BI 看板、病毒扫描、鉴权、多语言、灰度发布等均不在 MVP 范围。

## 8. 附件引用
- 《跨平台订单结算数据统一规范（Data Contract）v0.1》
- 《平台适配层（Platform Adapters）与字段定义矩阵 v0.1》
- 《视频号字段定义与映射 v0.1》
- 《Phase 1 MVP（XHS-only 最小可跑）》+《MVP 可运行骨架》

## 9. 部署与环境（G）
### 9.1 环境分层
- **dev-local**：本地开发，Next.js dev + DuckDB 文件。
- **staging-intl**：Vercel（前端）、S3（对象存储）、队列（Upstash/SQS）、Worker（容器/Fly/Render）。
- **prod-cn**：阿里云栈（OSS、MNS、SAE/ECS/ACK、ApsaraDB、CDN），满足 ICP 与合规。

### 9.2 云无关约束
1. Storage 抽象：`Storage { putObject; getPresignedUploadUrl; getPresignedDownloadUrl; list }`，实现 S3/AliOSS driver。
2. Queue 抽象：`Queue { enqueue; reserve; ack; fail }`，实现 Redis/SQS/MNS driver。
3. Worker：单 Docker 镜像，依赖 ENV；内置 DuckDB + httpfs/s3 扩展。
4. 数据真相：Parquet（分区 `parquet/platform=.../year=.../month=...`），DuckDB 仅做即席查询/导出。
5. 上传/下载：全部使用预签名 URL/STS，后端不直接中转大文件。
6. 配置：所有云参数通过 ENV 注入，禁止硬编码。

### 9.3 环境变量
```
APP_BASE_URL=...
NODE_ENV=...
STORAGE_DRIVER=s3|ali-oss
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
ALI_OSS_REGION=...
ALI_OSS_BUCKET=...
ALI_OSS_ACCESS_KEY_ID=...
ALI_OSS_ACCESS_KEY_SECRET=...
QUEUE_DRIVER=upstash|sqs|mns
UPSTASH_REDIS_URL=...
SQS_QUEUE_URL=...
MNS_ENDPOINT=...
MNS_QUEUE=...
DATABASE_URL=postgres://...
MAX_UPLOAD_MB=50
ALLOWED_EXT=.xlsx
SIGN_URL_TTL_SEC=3600
```

### 9.4 部署落地
- staging-intl：Vercel 前端；S3 raw/staging/parquet/exports；队列 Upstash/SQS；Worker on Fly/Render；日志 Sentry/Logtail。
- prod-cn：OSS 静态/SSR；MNS 队列；Worker on SAE/ECS/ACK；DB ApsaraDB；日志 SLS；域名/CDN/证书由阿里云管理。

### 9.5 CI/CD
- main push：构建前端（Vercel）+ Worker Docker；部署 staging-intl 并运行 E2E（金样 diff=0）。
- prod-cn：手动触发 + 审批，灰度 10%→50%→100%。

### 9.6 监控与安全
- 监控指标：处理成功率、平均耗时、失败率、导出成功率、P95 排队时延。
- 安全：.xlsx 白名单、大小上限、速率限制、鉴权（后续迭代）、宏/公式禁止执行、导出值化、防 CSV 注入。
- prod-cn：完成 ICP/网安备案，域名证书同地域配置。

## 10. 迁移计划（H）
### 10.1 前置
- Storage/Queue 双 driver 实现完毕；Worker 依赖 ENV；Parquet 为中心；直传签名流程统一。

### 10.2 步骤
1. 阿里云创建 OSS/MNS/ApsaraDB/SLS/CDN，完成 ICP。
2. S3 → OSS 数据同步（parquet/、exports/）；校验对象数与字节总量。
3. 部署 Worker 到 SAE/ECS/ACK，ENV 切换 ali-oss/mns，运行 shadow 任务。
4. 前端切换至 OSS+CDN（或 SSR 平台），上传改用 OSS STS/签名。
5. 双写：同时写 S3 与 OSS，核对笔数/金额；灰度切流。
6. DNS 切换：CDN 回源调整、缓存预热；观察 24–72h 后下线境外路径。

### 10.3 验收
- 上传成功率 ≥99.5%，首包 <2s。
- 金样 diff=0；失败任务日志可追溯并可重试。
- 导出成功率 ≥99%，签名链接有效期正确。
- 监控指标达标；日志追踪完整。
- 安全合规（ICP/证书/权限）完成。

### 10.4 风险
- 大文件/高并发：限流+重试、队列并发控制、Parquet 分区、流式导出。
- 跨境：prod-cn 同地域部署避免回源抖动。
- 成本：存储生命周期策略、导出清理、日志采样。

## 11. 部署与运维验收（I）
- Storage/Queue 抽象与双 driver 通过单元测试。
- Worker 容器可在 staging-intl/prod-cn 两套环境运行。
- Parquet 输出路径正确，DuckDB 查询结果与 PRD 一致。
- 队列任务幂等可重试；监控告警配置完成。
- staging-intl → prod-cn 迁移执行完毕：
  - 双写阶段笔数/金额一致。
  - DNS 切换演练与回滚预案通过。
  - 监控SLO 满足阈值。

