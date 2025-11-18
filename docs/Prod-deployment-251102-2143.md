【目标】把生产环境部署与国内化依赖一次到位，默认选型为：
- 队列：MNS（Simple Message Queue）
- 上传：STS 直传到 OSS（分片/断点续传），后端签临时凭证与策略
- 计算/服务：ECS 上跑 Next.js（web）与 Worker（PM2 常驻），Nginx 反代 + HTTPS
- 存储：DuckDB（本地数据目录）+ OSS（原始/导出/静态资源）
- CI/CD：GitHub Actions → 构建 → SCP/RSYNC 到 ECS → PM2 reload

【交付要求】
一、脚本与配置
1) scripts/prod/bootstrap-ecs.sh
   - 作用：在全新 ECS 上一键初始化：安装 Node 22（nvm）、Nginx、PM2、logrotate，创建 /srv/fitax 目录与 data/db、data/storage、logs 子目录，开放防火墙 80/443。
   - 输出：安装结果与版本号；若系统为 Ubuntu/Alibaba Cloud Linux 需自动适配包管理器。

2) nginx/fitax.conf（模版）
   - 作用：反代 443 → 127.0.0.1:3000（Next），80 跳转 HTTPS。
   - 变量：server_name、证书路径；提供一份 README 指导把证书放到 /etc/nginx/cert/ 下并 reload。
   - 要求：设置 `proxy_set_header X-Forwarded-Proto https` 与 XFF，启用 http2。

3) pm2/ecosystem.config.cjs
   - apps:
     - name: fitax-web; script: "npm"; args: "run start"; cwd: /srv/fitax; env: NODE_ENV=production, PORT=3000
     - name: fitax-worker; script: "node"; args: "worker/start.js start --interval 1000 --max-jobs 0"; cwd: /srv/fitax; env: NODE_ENV=production
   - 包含 save/startup 指南（`pm2 save && pm2 startup`）

4) .env.production.sample
   - 内容示例（注意不要包含任何 AK/SK）：
     NODE_ENV=production
     PORT=3000
     DEFAULT_USER_ID=test-user-001
     # DuckDB 本地目录
     DATABASE_DRIVER=duckdb
     DUCKDB_DATA_DIR=/srv/fitax/data/db
     # 存储（OSS），采用 RAM 实例角色或 STS，后端不要写死 AK/SK
     OSS_BUCKET=<your-bucket>
     OSS_REGION=<cn-xxx>
     # 队列（MNS）
     QUEUE_DRIVER=mns
     MNS_ENDPOINT=https://<mns-endpoint>
     MNS_QUEUE_NAME=fitax-jobs
     # 其他
     MAX_UPLOAD_MB=50
     ALLOWED_EXT=.xlsx,.csv
     SIGN_URL_TTL_SEC=3600

5) scripts/prod/deploy.sh
   - 用法：本地或 CI/CD 调用，把构建产物（.next、node_modules 生产集、worker/）与配置同步到 /srv/fitax，并执行：
     npm ci --omit=dev
     npm run build
     pm2 reload fitax-web || pm2 start ...
     pm2 reload fitax-worker || pm2 start ...
   - 兼容 GitHub Actions：支持传入 ECS_HOST/ECS_USER/KEY_PATH，以 scp+ssh 自动化。

6) scripts/prod/smoke.sh
   - 一键烟囱：curl POST /api/upload（返回 uploadId）→ POST /api/process（返回 jobId）→ 轮询 GET /api/job/:id（等待完成）→ GET /api/preview（fact/agg）→ GET /api/export?view=fact|agg（返回下载链接200）。
   - 打印关键断言：汇总视图每行满足「收入合计 - 扣平台佣金 - 扣其他费用 == 应到账金额」。

二、代码层改造
1) 队列驱动：新增 mns driver（或完善现有接口）
   - 统一 `QUEUE_DRIVER=mns`，实现：enqueue(payload, opts)、reserve(opts)、ack(id)、fail(id, err)、retry(id)。
   - 采用阿里云官方 SDK（或 REST），支持延时/死信（可先留 TODO），加入基础重试/backoff。
   - 提供最小集成测试（本地可注入 MNS Endpoint/Queue）。

2) 上传改造：实现 STS 直传（后端签发，前端直传）
   - 后端：新增 /api/oss/sts（或 /api/oss/policy），签发临时凭证与策略（限制 Bucket、前缀、大小、Content-Type，TTL 5–15 分钟）。
   - 前端：Upload 组件改为获取凭证→直传到 OSS（分片/断点续传），完成后把 objectKey + contentHash 作为元数据提交给 /api/upload，注册 UploadId。
   - 保留本地开发模式（STORAGE_DRIVER=local 时走本地存储）。

3) 生产配置清理
   - 删除 Upstash/OpenRouter 等境外依赖路径；.env.sample 不再出现 *_UPSTASH_*。
   - 默认 userId 的 fallback 改为 env（DEFAULT_USER_ID），但前端应始终透传 x-user-id。

三、文档
1) docs/prod-deploy.md
   - 阿里云控制台要点：创建 OSS 私有 Bucket、创建 MNS 队列（fitax-jobs）、给 ECS 绑定 RAM 实例角色（最小权限：读写 OSS 指定桶、发送/收取 MNS 指定队列）。
   - 把 `.env.production` 放到 /srv/fitax，执行 bootstrap-ecs.sh，上传证书，放置 nginx/fitax.conf 并 reload。
   - 首次部署：deploy.sh；验证：smoke.sh。

四、验收标准
- 在一台全新 ECS（cn-xxx）上，按 docs/prod-deploy.md 操作后：
  1) Nginx 443 对外，能访问前端页面；
  2) 通过前端上传一个 10–50MB 的 Excel，观察浏览器直传到 OSS 成功；
  3) 点击“处理并预览”：任务入队（MNS），Worker 消费并产出 Parquet 与有效视图；
  4) 预览页行级（A–O）与汇总（6 列）数据可用，导出接口返回可下载链接；
  5) smoke.sh 全绿；日志无未处理异常；
  6) 代码库中不包含任何明文 AK/SK（通过 grep 检查）。

请按上面清单生成所需脚本与配置、补齐队列与上传改造，并提交 PR 与操作录像/截图（ECS 初始化到 smoke 完成）。对任何需要我手工在控制台点选的步骤，请在文档中明确标注“人工步骤”。