# Dev + Test 指令模板（P0）

## 环境准备
```
npm install
mkdir -p data uploads expected tmp
cp .env.example .env
```
- `.env` 必填：`APP_BASE_URL`, `STORAGE_DRIVER`, `QUEUE_DRIVER`, `MAX_UPLOAD_MB`, `ALLOWED_EXT`, `SIGN_URL_TTL_SEC`。
- 开发用：`STORAGE_DRIVER=local`（./uploads），`QUEUE_DRIVER=inmemory`。

## 运行脚本建议
```
"scripts": {
  "dev:web": "next dev -p 3000",
  "dev:worker": "ts-node worker/index.ts",
  "dev": "run-p dev:web dev:worker",
  "test": "vitest run",
  "e2e": "vitest run -c tests/e2e/vitest.config.ts",
  "e2e:all": "run-p dev:web dev:worker \"wait-on http://localhost:3000 && npm run e2e\""
}
```
- 依赖：`npm i -D ts-node vitest wait-on npm-run-all`

## 开发步骤
1. 实现 Storage drivers（local/s3），Queue drivers（inmemory + upstash/sqs）。
2. 编写 Upload/Process/Job/Preview/Export API route handler。
3. 完成 Worker（merge/replace + Parquet 写入 + 有效视图更新）。
4. 实现平台适配器（wechat/xhs/douyin）逻辑。
5. 更新前端视图、导出按钮、状态显示。
6. 编写单元测试（Storage/Queue、merge/replace、适配器、金额守恒）。
7. 准备 fixtures (`fixtures/<platform>/...`)、expected CSV、E2E 脚本。
8. 运行 `npm run e2e:all`，确保金样 diff=0。

## E2E 目录结构
```
fixtures/
  xiaohongshu/{settlement.xlsx, orders.xlsx}
  douyin/{settlement.xlsx, orders.xlsx}
  wechat_video/{settlement.xlsx}
expected/
  xiaohongshu/{expected_fact.csv, expected_agg.csv}
  ...
tests/e2e/
  e2e.spec.ts
  helpers.ts
  vitest.config.ts
tmp/
  <platform>/actual_fact.csv
```

## E2E 环境
```
APP_BASE_URL=http://localhost:3000
E2E_YEAR=2025
E2E_MONTH=8
E2E_MODE=merge
```

## E2E 断言
- 上传 → 处理 → 导出（CSV inline）→ 金样字节级对比。
- 汇总恒等式校验。
- 导出列顺序/格式正确。

## 部署步骤（staging-intl）
1. 配置 Vercel 环境变量（Storage= S3，Queue=Upstash/SQS，App URL）。
2. 构建 Worker Docker 镜像，部署至 Fly/Render。
3. 在 staging 执行 E2E（金样 diff=0）。
4. 编写 README/Playbook，记录上传样本/触发处理/监控。

## 常用命令
```
npm run dev:web
npm run dev:worker
npm run test
npm run e2e
npm run e2e:all
```

