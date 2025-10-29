# 样本数据说明

## 目录与命名
- 所有样本文件位于项目根目录，命名以 `demo-` 开头。
- 含“`模型_规则样例`”的文件包含 15 列参考结果，可用作 T0/T1 金样。
- `demo-表头说明_251028.xlsx` 列出字段映射，可用于 S0 配置。

## 使用阶段
- **T0**：小样本（≈50 行），覆盖正常、退款、负值、正负运费。
- **T1**：开发样本（50–200 行）+ `expected_fact.csv` / `expected_agg.csv` 金样。
- **T2**：联调样本（5k–20k 行或 5–30MB）。
- **T3**：UAT 样本（全月脱敏数据）。

## 建议目录结构
```
uploads/samples/
  ├─ demo-小红书结算明细8月_样例_251026.xlsx
  ├─ demo-小红书订单明细8月_样例_251026.xlsx
  ├─ demo-抖音结算8月_样例_251026.xlsx
  ├─ demo-抖音订单8月_样例_251026.xlsx
  ├─ demo-视频号订单结算8月_样例_251026.xlsx
  ├─ demo-1024-小红书模型_规则样例_251026.xlsx
  ├─ demo-1024-抖音模型_规则样例_251026.xlsx
  └─ demo-1024-视频号模型_规则样例_251026.xlsx
expected/
  ├─ expected_fact.csv
  └─ expected_agg.csv
```

## 金样对比流程
1. 使用 `npm run e2e -- --platform <p> --input <file>` 生成 `tmp/<platform>/fact.csv` & `agg.csv`。
2. 运行 `diff expected/expected_fact.csv tmp/<platform>/fact.csv`。
3. 运行 `diff expected/expected_agg.csv tmp/<platform>/agg.csv`。

