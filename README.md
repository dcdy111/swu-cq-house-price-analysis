# 重庆二手房源挂牌价数据分析与智能可视化系统

当前阶段优先完成两个模块：房源数据管理、采集任务管理。

## 后端运行

```bash
pip install -r requirements.txt
python -m flask --app Backend.app init-db
python -m flask --app Backend.app run --debug --port 5000
```

正式运行请在 `.env` 或系统环境变量中配置 MySQL `DATABASE_URL`。当前本地默认使用：

```text
DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/real_estate?charset=utf8mb4
TEST_DATABASE_URL=mysql+pymysql://root:root@127.0.0.1:3306/real_estate_test?charset=utf8mb4
```

测试也使用 MySQL 的 `real_estate_test`，不使用 SQLite 内存库。

## 本地统一入口启动方式

如果本机已经有旧 Flask/Vite 进程占用 `5000/5173`，前端可能请求到旧后端，表现为登录时报
`Unexpected token '<'` 或 `/api/auth/login` 返回 HTML。推荐统一只用下面这个脚本启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_local_dev.ps1
```

如果端口被旧服务占用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_local_dev.ps1 -UseFreePorts
```

脚本会输出一个 `Unified browser URL`。演示和页面验收只打开这个地址；前端所有 `/api` 请求由 Vite 代理转发到当前 Flask 后端，避免一会儿访问前端端口、一会儿访问后端端口。

启动后可做只读接口检查：

```bash
python scripts/local_demo_smoke.py --base-url http://127.0.0.1:5000
```

如需连同 Agent 问数一起验收，可加 `--include-agent`，但这会新增一条 `agent_tool_calls` 记录。

## 当前真实业务口径

本系统优先展示“可维护的数据产品”能力，而不是一次性爬虫：

- 数据层主线：MySQL 数据底座、`source + fingerprint` 去重、增量 upsert、价格快照、任务日志、六维质量报告。
- 走势分析：`price_trend` 基于 `listing_snapshots.snapshot_at` 做月度挂牌价快照聚合，只表示历史快照趋势，不表示多年成交趋势或未来预测。
- 规则推荐：Agent 的 `recommend_buy_options` 使用预算、面积、区县、通勤代理和质量分做可解释排序，不做协同过滤或深度学习推荐。
- 异常识别：分析模块把异常房源作为风险提示和复核线索，不直接判定房源错误。
- 区域画像：Dashboard 的“区域性价比指数”复用区县均价、样本量、质量分、价格稳定性和户型分布做相对排序，不代表成交价或投资建议。

结构增强字段遵守事实边界：`metro_distance / building_type / has_elevator / total_floors` 只保存爬虫页面中明确出现并解析出的值；房天下列表页对电梯和总楼层覆盖有限，缺失就保留为空，不做后处理猜测。

## 调度与质量报告

默认不启动后台调度，避免开发时自动爬取。需要定期生成质量报告或增量采集时，在 `.env` 中开启：

```text
SCHEDULER_ENABLED=true
QUALITY_REPORT_JOB_ENABLED=true
QUALITY_REPORT_INTERVAL_HOURS=24
INCREMENTAL_CRAWL_JOB_ENABLED=false
INCREMENTAL_CRAWL_SOURCE=fang
INCREMENTAL_CRAWL_DISTRICTS=两江新区
INCREMENTAL_CRAWL_MAX_PAGES=1
```

手动验收接口：

```bash
curl http://127.0.0.1:5000/api/scheduler/status
curl -X POST http://127.0.0.1:5000/api/scheduler/run-quality-report
curl http://127.0.0.1:5000/api/quality/reports
curl -X POST http://127.0.0.1:5000/api/scheduler/run-incremental-crawl ^
  -H "Content-Type: application/json" ^
  -d "{\"source\":\"fang\",\"districts\":[\"两江新区\"],\"max_pages\":1,\"run_now\":false}"
```

分析建模使用 `scikit-learn` 做多模型对比，环境缺少 sklearn 或训练失败时自动退回 Ridge 兜底。当前回归候选模型包括：

- `RandomForestRegressor`
- `GradientBoostingRegressor`
- `HistGradientBoostingRegressor`
- `SourceSegmentedRandomForest` 来源分层模型

系统会在同一训练/测试切分下按测试集 R² 自动选择最佳模型；最佳模型写入 `model_results.result_type='regression'`，每个候选模型指标写入 `model_results.result_type='regression_candidate'`，便于答辩展示模型选择证据。当前回归特征包括：

- 数值特征：面积、室数、厅数、房龄、楼层等级、区县目标编码、楼盘目标编码、样本量强度。
- 分类特征：来源、区县、户型、朝向、装修、楼层，训练时按高频类别做 one-hot 编码。
- 训练策略：回归训练前剔除极端挂牌单价、区县明显偏离和面积极端样本；EDA、聚类和异常检测仍保留原始样本。
- 报告资产：分析页支持下载模型结果 JSON，并复制可直接放入报告的 Markdown 引用。

模型输出用于解释挂牌价影响因素和辅助估价，不代表成交价预测。

分析验收接口：

```bash
curl -X POST http://127.0.0.1:5000/api/analysis/jobs ^
  -H "Content-Type: application/json" ^
  -d "{\"job_type\":\"all\",\"max_samples\":1000}"
```

模型结果落库检查：

```sql
SELECT result_type, model_name
FROM model_results
WHERE job_id = (SELECT MAX(id) FROM analysis_jobs WHERE status = 'success')
ORDER BY id;
```

本地增量与快照验收：

```bash
python scripts/verify_incremental_snapshot.py
```

该脚本会创建一条本地验收样本，验证“重复写入不新增主表、价格变化新增快照”，默认验证后清理样本；需要保留数据库证据时可加 `--keep`。

数据库结构字段迁移：

```bash
mysql -u root -p real_estate < docs/schema_migrations_20260630.sql
```

如接口报 `Unknown column 'listings.total_floors'` 或 `Unknown column 'crawl_tasks.run_id'`，说明当前 MySQL 还没应用这份迁移。

## 前端运行

```bash
cd Frontend
npm install
npm run dev
```

单独启动前端时，Vite 默认把 `/api` 代理到 `http://127.0.0.1:5000`。如后端使用其他端口，请设置：

```powershell
$env:VITE_BACKEND_PROXY_TARGET="http://127.0.0.1:5002"
npm run dev -- --host 127.0.0.1 --port 5173
```

## 旧库冷启动导入

旧 SQLite 只作为一次性导入源，导入后业务接口只访问当前数据库。

```bash
python scripts/import_legacy_sqlite_to_mysql.py ^
  --source-db "..\2025学年设计\pythonProject1\data\lianjia_houses.db"
```

如需显式指定 MySQL：

```bash
python scripts/import_legacy_sqlite_to_mysql.py ^
  --source-db "..\2025学年设计\pythonProject1\data\lianjia_houses.db" ^
  --database-url "mysql+pymysql://root:password@127.0.0.1:3306/real_estate?charset=utf8mb4"
```
