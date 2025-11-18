─ Worked for 18m 38s ───────────────────────────────────────────────────────────────────

• 当前微信视频号链路卡在“前端真实跑通”与“后端实际落地”之间，主要缺口在真实调用链未连通、
  生成的数据未能查询与前端接口参数不匹配。需要按链路做以下工作：

  1. 上传&处理阶段

  - 前端的 uploadFiles 接口只返回单个 uploadId，但 /api/process 需要
    { settlementUploadId, ordersUploadId? } 结构；需要修正前端提交格式、后端返回值，继而
    驱动生成真实作业。
  - uploadFiles 在请求失败时用随机 uploadId 模拟成功，导致后续 /api/process 调用时根本找
    不到上传记录，必须移除模拟逻辑并反馈错误。
  - 修正 /api/process 请求体格式，让前端传入的结构与后端 ProcessRequest 匹配，同时存储对
    应上传记录。
  - 确保 registerUpload 返回含 fileType 的记录，前端 FileStatusList 能按真正上传状态
    展示。

  2. 队列/Worker 链路

  - .env.local 配的是 QUEUE_DRIVER=upstash，但本地未启动实际 Upstash 服务；要么启用本地/
    真实 Upstash 配置，要么改用 inmemory 进行真机调试。
  - Worker 依赖 jobs.json, datasets.json, dataset_rows.json 等数据文件，仓库里缺失，需要
    创建并在 processJob 中正确维护（当前仓库没有 datasets.json 等文件，导致后续查询时无
    法找到有效数据集）。
  - 清理旧的 jobs.json, uploads.json 中无效记录，确保 worker 能读写成功；必要时写迁移脚
    本初始化。
  - 校验 getJobInfo、createJob 与 Worker 的交互，确认作业状态更新、metadata 落盘无误，避
    免出现报告中提到的“jobId 不一致”问题。

    • 队列/Worker 阶段我分成了三个小步骤，方便逐项验证：

        1. 看当前 Worker 配置和日志，搞清楚作业为何不被消费。
        2. 因应结果调整本地队列（比如切到 inmemory）并让 Worker 真正取任务。
        3. 确认 Worker 产出的数据和状态（datasets/effective/job JSON），为下一阶段铺路。


  3. Parquet & 有效视图

  - 现有 processData 会写入 frontend/data/parquet/...，但 updateEffectiveView 读取的是仓
    库根目录下 data/，路径不统一；需要统一数据根目录（建议使用 config().storage.baseDir
    或显式 DATA_DIR），保证 Worker 输出能被 API 查到。
  - updateEffectiveView 依赖 datasets.json 和 dataset_rows.json，目前缺失；要实现 merge/
    replace 需要先补齐这些文件的维护逻辑（addDatasetRow 等）。
  - DuckDB 查询报错“unique_ptr nullptr”；需确认 duckdb 版本是否支持当前 read_parquet 路
    径写法，必要时升级或换用 Arrow JS/duckdb WASM；至少保证 dev 本地能成功查询事实/聚
    合 Parquet。
  - 在 Parquet 写入后调用 updateEffectiveView 时，设置与 queryFactData 匹配的 user_id,
    platform, year, month 字段，否则查询不到数据。

  4. 预览 & 导出 API

  - /api/preview、/api/export 调用 DuckDB 查询；在 DuckDB 未修复前它们会返回空数据。需要
    优先修好 DuckDB 或换成 parquetjs / Arrow 读取，以确保前端能看到真实数据。
  - 补充分页、总数查询时的 countOnly 模式，避免 queryFactData 读取百万行并卡死。
  - 成功请求要返回 summary 和 warnings，前端才能正确显示汇总和错误信息。
  - 确保 /api/export 在没有数据时返回明确错误，让用户知道处理未完成，而不是下载空文件。

  5. 前端整体体验

  - 修复 handleProcess 中的流程：需要在 processData 返回后轮询 /api/job/:id 直到完成，再
    触发 fetchFact / fetchAgg，避免数据未落地就预览。
  - fetchFact/fetchAgg 在 API 失败时 fallback 生成 mock 数据，应改成直接抛错并在 UI 中提
    示，避免误以为链路成功。
  - 将上传记录、作业状态展示在 UI（利用 /api/job/:id 返回的 metadata），帮助定位处理
    状态。

  6. 测试与验证

  - 整理存在的 vitest 测试，使之使用真实队列/存储或可靠 mock，不再依赖随机数据；新增“真
    实流程”测试：调用 upload → process → worker → preview/export。
  - 提供用于手动验证的脚本（或在 README 中写明），比如运行 worker、触发处理、调用
    preview/export 并检查输出。
  - 添加验收 checklist：成功上传、作业完成、预览返回非空、导出文件可打开、有金额恒等式
    校验。

  完成以上修复后，才能在真实前端上完整跑通微信视频号链路：上传结算文件 → 入队处理 →
  Worker 解析/合并 → 写 Parquet / 更新有效视图 → 预览展示 → 导出下载。建议按顺序推进：先
  修前端请求/响应 → 校好 storage/queue/worker → 打通 DuckDB 查询 → 补验收测试。