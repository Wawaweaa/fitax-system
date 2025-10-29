# 开发计划 / WBS

## 里程碑
- **M0**：staging-intl 全链路（上传→处理→预览→导出）上线 & 金样 E2E 通过。
- **M1**：prod-cn 基础环境搭建（OSS/MNS/SAE/ApsaraDB）+ Worker shadow 验证。
- **M2**：双写/灰度完成，DNS 切换，prod-cn 正式上线。

## 分阶段任务
| 阶段 | 任务 | 输入 | 输出 | 负责人 | 验收标准 |
| --- | --- | --- | --- | --- | --- |
| M0 | 前端预览补完（A–O/汇总视图、URL 状态） | PRD | 完整预览页 | FE | 手测通过 |
| M0 | Storage/Queue 抽象实现（S3/AliOSS, Redis/SQS/MNS） | 需求 G/H | `lib/storage.ts`, `lib/queue.ts` | BE | 单元测试覆盖 driver 切换 |
| M0 | wechat_video adapter + Worker 端到端 | demo 视频号样本 | Parquet 产出 + 导出 | BE | 金样 diff=0 |
| M0 | xhs adapter（双表 join、运费均分）、DuckDB schema | XHS 样本 | Parquet + agg | BE | diff=0，警告记录 |
| M0 | douyin adapter（空白清洗、注释过滤） | 抖音样本 | Parquet + agg | BE | diff=0，ABF 无空白 |
| M0 | 队列 Worker + Docker 镜像 | 队列抽象 | Worker 容器 | Infra | 任务可入队/出队；失败可重试 |
| M0 | E2E 脚本（导出 CSV diff） | expected CSV | `npm run e2e:*` | QA | diff=0 |
| M0 | staging-intl 部署脚本 | Env 配置 | Vercel + Worker | Infra | 部署成功，E2E 通过 |
| M1 | prod-cn 资源创建（OSS/MNS/ApsaraDB/SLS/CDN、ICP） | 云账号 | 资源清单 | Infra | 基础资源可用 |
| M1 | Worker shadow 任务（Ali driver） | 阿里云环境 | 日志报告 | BE | 队列消费成功，金样 diff=0 |
| M2 | 双写/灰度 + 监控 | 两套 driver | 双写报告、监控面板 | Infra | 指标达标、SLO 满足 |
| M2 | DNS 切换 & 回滚预案 | CDN/域名 | 切换 SOP | Infra | 切换成功，无重大告警 |

## 具体执行规划
1. 整合前端视图变化；更新 README 与文档。
2. 实现 Storage/Queue 抽象（S3/AliOSS、Redis/SQS/MNS）及配置管理。
3. 实现 Worker 架构（Dockerfile、队列消费、Parquet 生成、签名导出）。
4. 完成 wechat/xhs/douyin adapter 与 DuckDB/Parquet 输出。
5. 编写单元/集成/E2E 测试（含金样 diff）。
6. 部署 staging-intl：Vercel + Fly/Render Worker；配置 S3/Queue/ENV。
7. 监控/日志接入（Sentry、Logtail/Datadog）。
8. 构建 prod-cn 环境（OSS/MNS/SAE/ApsaraDB），执行 shadow 验证。
9. 同步数据 S3→OSS，开启双写，灰度切流。
10. 完成 DNS 切换和回滚预案，发布报告。

## 输出文档
- `/docs/Plan.md`（本文件）
- `/docs/QA.md`（验收清单）
- `/docs/OpenIssues.md`（待决问题）
- `/docs/DevTestTemplate.md`（执行指令）

