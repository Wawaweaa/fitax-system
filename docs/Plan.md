# 开发计划 / WBS（P0 版）

## 里程碑
- **M0：最小端到端链路**
  - 完成 Storage/Queue 驱动（至少 `local + s3`、`inmemory + upstash/sqs`）。
  - 实现 API upload/process/job/preview/export。
  - Worker 可处理 merge/replace，写 Parquet 并更新有效视图。
  - 三平台适配器完成 S0/S1（A–O + 汇总）。
  - 行级/汇总视图前端联调，导出 CSV/XLSX。
  - 金样 E2E 跑通，金样 diff=0。
  - staging-intl 部署成功。
- **M1：prod-cn 基础环境**
  - OSS/MNS/SAE/ApsaraDB/SLS/CDN 资源准备与配置（含 ICP/证书）。
  - Worker 容器在 prod-cn 环境运行（shadow）。
  - 数据同步脚本（S3→OSS）验证。
- **M2：双写与灰度上线**
  - 双写（S3 + OSS）→ 指标一致。
  - 灰度 10%→50%→100%，DNS 切换。
  - 回滚预案演练。

## 任务拆解
| 阶段 | 任务 | 输入 | 输出 | 负责人 | 验收 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| M0 | Storage 抽象 (local/s3) | PRD/Architecture | `lib/storage` drivers | BE | 单测 | 支持上传/导出 | 
| M0 | Queue 抽象 (inmemory + upstash/sqs) | 同上 | `lib/queue` drivers | BE | 单测 | 支持 reserve/ack/fail | 
| M0 | API Upload/Process/Job | docs/API | `/api/*` route handlers | BE | API 单测 | 含 content_hash、mode | 
| M0 | Worker merge/replace | docs/PRD | `worker/index.ts` | BE | 作业状态日志 | 包含 row_key/row_hash | 
| M0 | Adapter wechat_video | 样本/附件 | `adapters/wechat_video.ts` | BE | 金样 diff | S0/S1 逻辑 | 
| M0 | Adapter xiaohongshu | 样本 | `adapters/xiaohongshu.ts` | BE | 金样 diff | 处理跨表/运费 | 
| M0 | Adapter douyin | 样本 | `adapters/douyin.ts` | BE | 金样 diff | 去空白/注释 | 
| M0 | 有效视图 & Parquet | Architecture | `lib/parquet` etc. | BE | 预览/导出通过 | fact/agg + effective | 
| M0 | 前端视图 & 导出 | PRD | 更新 page.tsx/components | FE | 手测通过 | 行级/汇总/导出 | 
| M0 | 金样 E2E | E2E 规范 | `tests/e2e` | QA | Vitest 通过 | diff=0 + 恒等式 | 
| M0 | 部署脚本 (staging) | 部署蓝图 | README/脚本 | Infra | 样本跑通 | Vercel + S3 + Queue + Worker | 
| M1 | prod-cn 资源部署 | 阿里云规划 | Terraform/手册 | Infra | 资源可用 | OSS/MNS/SAE 等 | 
| M1 | Worker shadow | 样本 | 日志报告 | BE | 金样 diff=0 | ali-oss/mns 驱动 | 
| M2 | 双写/灰度 | 部署计划 | 报告 | Infra | 指标通过 | 双写校验 + DNS | 

## 执行顺序建议
1. 抽象 Storage/Queue & 配置管理 → 先实现 local/inmemory。
2. 搭建 upload/process/job 基础 API。
3. Worker 流程（merge/replace）与 metadata 管理。
4. 平台适配器（wechat → xhs → douyin），同时实现 Parquet 写入/有效视图。
5. 导出 API（CSV inline + XLSX 签名链接）。
6. 前端视图联调（行级/汇总、URL 同步、导出按钮）。
7. 金样 E2E：fixtures + expected + Vitest；修复差异。
8. 部署 staging-intl：Vercel + S3 + Queue + Worker。
9. 准备 prod-cn 资源 & shadow → M2 双写/灰度。

## 输出文档
- `/docs/PRD.md`、`/docs/Architecture.md`、`/docs/API.md`、`/docs/Plan.md`。
- `/docs/QA.md`（验收标准）、`/docs/DevTestTemplate.md`（执行指令）、`/docs/OpenIssues.md` 更新。
- README 部署说明、环境变量示例 `.env.example`。

