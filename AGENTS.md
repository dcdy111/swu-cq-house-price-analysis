# AGENTS.md｜重庆二手房源价格数据分析与智能可视化系统

> 本文件供 Codex、Cursor、Vibe Coding Agent 执行开发时读取。目标是让 AI 开发工具按明确的 GOAL 标准拆解任务、实现功能、运行自验收，并避免跨模块乱改。

## 0. 项目总目标

构建一个面向“重庆市二手房挂牌价数据”的轻量化后台管理式数据产品，形成以下闭环：

```text
数据源 → 多线程采集 → MySQL 数据底座 → 数据清洗与质量评分 → 增量快照 → 分析建模 → ECharts 可视化 → DeepSeek Agent 问数/报告 → 反馈补采与维护
```

系统必须覆盖课程设计硬性要求：

1. 爬取重庆各区县二手房挂牌价数据，最终有效数据不少于 50,000 条。
2. 对数据进行清洗、整理并保存到 MySQL。
3. 支持定期更新，且更新时采用增量方式。
4. 使用 Web 形式展示多维可视化图表。
5. 使用挖掘算法进行分析，并输出可解释结论。
6. Web 系统运行稳定，界面科研简约、美观大方。
7. 技术和算法先进且合理，包括多线程采集、增量快照、数据质量监控、模型解释和 Agent 工具调用。

## 1. GOAL 任务标准

任何交给 Codex/Cursor 的任务都必须按 GOAL 标准执行。

### 1.1 GOAL 含义

- **G｜Goal：任务目标**  
  只描述一个明确功能，不允许一次性生成整个系统。

- **O｜Output：交付产物**  
  必须列出新增/修改的文件、API、页面、脚本、测试或文档。

- **A｜Acceptance：验收标准**  
  必须给出可运行命令、接口返回示例、数据库检查 SQL、页面检查点或测试用例。

- **L｜Limits：边界限制**  
  必须列出允许修改范围、禁止修改范围、禁止行为和安全边界。

### 1.2 Codex 执行任务时必须输出

每次任务完成后，必须在回复中输出以下四段：

```text
1. 修改摘要
- 改了哪些文件
- 实现了什么功能

2. 关键实现
- 核心逻辑是什么
- 为什么这样实现

3. 自验收结果
- 运行了哪些命令
- 结果是否通过
- 如果未运行，必须说明原因

4. 风险与下一步
- 还存在哪些风险
- 下一步建议做什么
```

## 2. 不可违反的全局约束

1. 本项目运行数据库统一使用 **MySQL 8.x**。旧 SQLite/CSV 只能作为一次性冷启动导入源，不能作为运行期数据库。
2. 后端采用 **Flask API**，必须使用分层结构：`api -> services -> models -> crawlers/tasks/ml/agent`。
3. 不允许在 Flask route 中写复杂 SQL、爬虫逻辑、模型训练逻辑或 Agent 工具逻辑。
4. 前端采用轻量路线：`Vite + 原生 HTML/CSS/JS + ECharts`。不强制使用 Vue 管理模板，不引入复杂权限系统。
5. 爬虫核心必须由确定性程序完成。Agent 不得自主打开网页爬取，不得绕过验证码，不得做强对抗反爬。
6. 所有价格必须表述为“挂牌价/报价”，不得写成“成交价”。
7. DeepSeek Agent 不允许直接连接 MySQL，不允许执行用户输入 SQL；只能调用 ToolRegistry 中的白名单工具。
8. 所有模型结论必须带指标或证据，不得声称“精准预测房价”。
9. 每次改数据库结构必须同步 SQL 脚本或迁移说明。
10. 每个 P0 功能必须有最小测试、接口自测或数据库验收 SQL。
11. 不使用 Docker 作为第一版部署方案。部署采用 `Nginx + Gunicorn + systemd + MySQL`。
12. 页面风格保持科研简约：白底、深蓝标题、浅灰分区、少量强调色；不使用复杂动效遮盖功能。
13. 禁止一次性大面积重构多个模块。除非任务卡明确允许，否则不得跨模块修改。

## 3. 推荐技术栈

| 模块 | 技术 | 说明 |
|---|---|---|
| 后端 | Flask + Blueprint + Service | 轻量 API 服务 |
| 数据库 | MySQL 8.x | 唯一运行数据库 |
| ORM | SQLAlchemy + PyMySQL | 数据访问层 |
| 前端 | Vite + 原生 JS + ECharts | 轻量后台与可视化 |
| 爬虫 | requests + BeautifulSoup；Playwright 回退 | 静态优先，动态回退 |
| 并发 | ThreadPoolExecutor | 多线程采集 |
| 调度 | APScheduler | 定时增量更新 |
| 分析 | Pandas + scikit-learn | EDA、回归、聚类、异常检测 |
| Agent | DeepSeek API + ToolRegistry | 问数、诊断、报告 |
| 部署 | Nginx + Gunicorn + systemd + MySQL | 阿里云轻量部署 |

## 4. 目标仓库结构

```text
real-estate-intelligence/
├─ backend/
│  ├─ app.py                    # create_app 入口
│  ├─ config.py                 # 环境变量与配置
│  ├─ extensions.py             # db、scheduler、logger
│  ├─ api/                      # Blueprint 路由层
│  │  ├─ overview.py
│  │  ├─ listings.py
│  │  ├─ charts.py
│  │  ├─ crawl.py
│  │  ├─ analysis.py
│  │  └─ agent.py
│  ├─ models/                   # SQLAlchemy 模型
│  ├─ services/                 # 业务服务层
│  ├─ crawlers/                 # BaseCrawler + 数据源实现
│  ├─ tasks/                    # APScheduler 与任务状态机
│  ├─ ml/                       # 特征工程、训练、聚类、异常检测
│  ├─ agent/                    # ToolRegistry、Prompt、AgentService
│  └─ tests/
├─ frontend/
│  ├─ index.html
│  ├─ assets/css/
│  └─ assets/js/
├─ scripts/
│  ├─ import_old_sqlite_to_mysql.py
│  ├─ backup_mysql.sh
│  └─ deploy_without_docker.sh
├─ docs/
│  ├─ architecture.md
│  ├─ api.md
│  └─ prompts/
├─ requirements.txt
├─ .env.example
├─ AGENTS.md
└─ README.md
```

## 5. 分阶段开发目标与 Definition of Done

### D1｜工程骨架

**Goal**：建立可运行的 Flask + MySQL + 前端静态页面骨架。  
**Output**：`backend/app.py`、`config.py`、`extensions.py`、`/api/health`、前端首页。  
**Acceptance**：

```bash
python -m flask --app backend.app run --debug
curl http://127.0.0.1:5000/api/health
```

预期返回：

```json
{"code":0,"message":"ok","data":{"status":"healthy"}}
```

**Limits**：不得实现业务大功能，不得写爬虫和模型代码。

### D2｜MySQL 表结构与冷启动导入

**Goal**：创建核心表，并把旧 SQLite/CSV 样本导入 MySQL，使有效记录数不少于 50,000。  
**Output**：SQL 脚本、SQLAlchemy 模型、`scripts/import_old_sqlite_to_mysql.py`。  
**Acceptance**：

```sql
SELECT COUNT(*) FROM listings WHERE status IN ('active','valid');
SELECT district, COUNT(*) FROM listings GROUP BY district ORDER BY COUNT(*) DESC LIMIT 10;
```

通过标准：有效记录数 >= 50,000；主要字段 `district,total_price,unit_price,area,layout,link` 可查询。

**Limits**：旧 SQLite 只做导入源，导入后业务接口不得再访问 SQLite。

### D3｜房源查询 API 与数据表页面

**Goal**：实现房源分页查询、筛选和前端表格展示。  
**Output**：`GET /api/listings`、`ListingService`、前端数据表。  
**Acceptance**：

```bash
curl "http://127.0.0.1:5000/api/listings?district=渝北&page=1&page_size=20"
pytest backend/tests/test_listings_api.py
```

通过标准：返回统一格式，支持 district、price_min、price_max、area_min、area_max、keyword、page、page_size。

**Limits**：不得在路由层拼复杂 SQL；查询逻辑放在 service 层。

### D4｜采集任务与多线程爬虫

**Goal**：实现可创建、可记录日志、可查看状态的采集任务。  
**Output**：`BaseCrawler`、`LianjiaCrawler`、`crawl_tasks`、`crawl_logs`、采集任务页面。  
**Acceptance**：

```bash
curl -X POST http://127.0.0.1:5000/api/crawl/tasks \
  -H "Content-Type: application/json" \
  -d '{"source":"lianjia","districts":["渝北"],"max_pages":2,"mode":"manual"}'
```

通过标准：任务状态从 pending/running 进入 success 或 partial_failed；日志可查；失败页不导致系统崩溃。

**Limits**：默认 MAX_WORKERS=3~5；请求随机间隔 1~3 秒；不做强对抗反爬。

### D5｜增量维护、去重与快照

**Goal**：实现 fingerprint 去重、upsert、价格变化快照、last_seen 状态维护。  
**Output**：`listing_snapshots`、增量保存函数、质量报告表、任务质量指标。  
**Acceptance**：

```sql
SELECT COUNT(*) FROM listings;
SELECT COUNT(*) FROM listing_snapshots;
SELECT COUNT(*) FROM data_quality_reports;
```

测试方式：重复导入/采集同一批数据，主表不异常增加；模拟价格变化，快照表新增记录。

**Limits**：fingerprint 不包含价格；价格变化必须进入 snapshot，而不是新建房源。

### D6｜可视化 Dashboard

**Goal**：实现科研简约风可视化大屏。  
**Output**：`/api/overview`、`/api/charts/*`、Dashboard 页面。  
**Acceptance**：Dashboard 至少包含：总体 KPI、区县均价排行、价格分布、面积-价格散点、趋势图。常用图表接口在 10 万数据下尽量 < 2 秒。

**Limits**：后端返回 JSON，前端用 ECharts 渲染；不生成静态 PNG 作为主展示方式。

### D7｜分析建模

**Goal**：实现 EDA、价格预测、KMeans 分层、异常检测，并输出可解释结果。  
**Output**：`analysis_jobs`、`model_results`、分析页面。  
**Acceptance**：

```bash
curl -X POST http://127.0.0.1:5000/api/analysis/jobs \
  -H "Content-Type: application/json" \
  -d '{"job_type":"all"}'
```

通过标准：输出 MAE/RMSE/R²、特征重要性、聚类画像、异常房源列表。

**Limits**：模型定位为解释与辅助估价；不得写“精准预测成交价”。

### D8｜DeepSeek Agent 工具调用

**Goal**：让 Agent 通过后端工具读取统计结果、任务日志和模型结果，生成问数回答和报告。  
**Output**：`AgentService`、`ToolRegistry`、`agent_tool_calls`、`generated_reports`、智能问答页。  
**Acceptance**：提问“渝北区均价是多少？”时必须调用 `query_market_stats`，并保存 tool_call 记录。回答中所有数值必须来自工具返回 JSON。

**Limits**：Agent 不得直连数据库，不得执行用户输入 SQL，不得编造具体数值。

### D9｜阿里云部署与演示证据

**Goal**：完成阿里云 ECS 上线部署，并形成答辩证据。  
**Output**：Nginx 配置、systemd 服务、部署脚本、README、演示截图。  
**Acceptance**：公网能访问首页和 API；服务器重启后服务自动恢复。  
**Limits**：第一版不使用 Docker；不得把 `.env`、API Key、数据库密码提交到仓库。

## 6. 核心数据库设计要求

必须实现以下表：

- `listings`：标准房源主表。
- `listing_snapshots`：价格与状态快照。
- `crawl_tasks`：采集任务。
- `crawl_logs`：采集日志。
- `data_quality_reports`：数据质量报告。
- `analysis_jobs`：分析任务。
- `model_results`：模型结果。
- `agent_tool_calls`：Agent 工具调用记录。
- `generated_reports`：系统生成报告。

### 6.1 listings 必须字段

```text
id, source, source_listing_id, title, link, district, community,
total_price, unit_price, area, layout, rooms, halls,
orientation, decoration, floor_text, floor_level,
build_year, house_age, fingerprint, data_quality_score,
status, first_seen_at, last_seen_at, created_at, updated_at
```

### 6.2 增量规则

1. `source + fingerprint` 不存在：插入 listings，并写第一条 snapshot。
2. fingerprint 存在且价格未变化：只更新 `last_seen_at`。
3. fingerprint 存在且价格变化：更新 listings 当前价格，并追加 snapshot。
4. 连续 N 次未出现：标记为 inactive，不物理删除。
5. 异常字段保留但标记 abnormal，模型训练默认排除。

## 7. API 设计要求

所有接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "20260701-abcdef"
}
```

必须实现的 P0/P1 接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/overview` | 总体 KPI |
| GET | `/api/listings` | 房源分页查询 |
| GET | `/api/charts/district-price` | 区县均价与数量 |
| GET | `/api/charts/price-distribution` | 价格分布 |
| GET | `/api/charts/price-trend` | 价格趋势 |
| POST | `/api/crawl/tasks` | 创建采集任务 |
| GET | `/api/crawl/tasks` | 任务列表 |
| GET | `/api/crawl/tasks/{id}` | 任务详情与日志 |
| POST | `/api/analysis/jobs` | 启动分析任务 |
| GET | `/api/analysis/jobs/{id}` | 查询分析结果 |
| POST | `/api/agent/chat` | Agent 问数/诊断/报告 |
| GET | `/api/reports/{id}` | 查看报告 |

## 8. Agent 模块边界

DeepSeek 本身不直接读取 MySQL。正确流程：

```text
用户问题
→ POST /api/agent/chat
→ AgentService 判断意图
→ ToolRegistry 选择白名单工具
→ Service 层查询 MySQL 聚合视图/任务日志/模型结果
→ 返回 JSON
→ DeepSeek 基于 JSON 生成回答
→ agent_tool_calls 保存工具名、参数和结果
```

### 8.1 白名单工具

| 工具 | 权限 | 用途 |
|---|---|---|
| query_market_stats | 只读 | 查询总体、区县、价格区间统计 |
| get_chart_series | 只读 | 获取 ECharts 序列数据 |
| get_crawl_status | 只读 | 查询采集任务状态和失败页 |
| run_incremental_crawl | 写任务 | 创建增量采集任务，不直接写房源 |
| run_analysis_job | 写任务 | 创建分析任务，不直接写模型结果 |
| get_model_result | 只读 | 查询模型指标和特征重要性 |
| generate_report | 写报告 | 基于工具结果生成报告 |

### 8.2 Agent 系统提示词

```text
你是“重庆二手房挂牌价数据分析助手”。你只能基于系统工具返回的数据回答问题。
当用户询问市场数据、区县对比、趋势、采集状态、模型结果时，必须先调用工具。
禁止编造具体数值。若工具没有返回数据，应说明数据不足，并建议先执行采集或分析任务。
回答格式：结论 -> 关键证据 -> 可执行建议。
所有涉及价格的数据都表述为“挂牌价/报价”，不得表述为“成交价”。
```

## 9. 前端页面验收要求

| 页面 | 必须内容 | 验收标准 |
|---|---|---|
| Dashboard | KPI、区县排行、价格分布、散点、趋势、Agent 摘要 | 图表可渲染，支持基础筛选 |
| 房源表 | 筛选栏、分页表、详情弹窗、CSV 导出 | 能显示 MySQL 中的数据 |
| 采集任务 | 创建任务、进度、日志、失败原因 | 任务状态和日志可追踪 |
| 分析建模 | 模型按钮、指标、特征重要性、聚类、异常列表 | 能展示一次分析任务结果 |
| 智能问答 | 对话区、工具调用记录、报告生成 | 回答必须有工具调用证据 |
| 系统设置 | 数据源开关、并发数、定时规则、API Key 提示 | P2，可后做 |

## 10. 测试与自验收命令

Codex 在完成对应模块后，应优先运行以下命令。若当前环境缺依赖或无法运行，必须说明原因，不得假装已通过。

```bash
# Python 语法检查
python -m compileall backend

# 后端测试
pytest backend/tests -q

# Flask 本地启动
python -m flask --app backend.app run --debug --port 5000

# 前端构建
npm install
npm run build

# MySQL 数据规模检查
mysql -u root -p -e "SELECT COUNT(*) FROM real_estate.listings;"

# 采集任务接口检查
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/overview
```

## 11. 数据清洗规则

| 字段 | 规则 | 异常标记 |
|---|---|---|
| total_price | 提取数字，单位万元 | <5 或 >5000 标记 abnormal |
| unit_price | 提取数字，单位元/平方米 | <1000 或 >100000 标记 abnormal |
| area | 提取数字，单位平方米 | <10 或 >500 标记 abnormal |
| layout | 解析 rooms/halls | 解析失败保留原文 |
| floor | 归一 low/mid/high | 无法判断为 unknown |
| build_year | 提取年份，派生 house_age | <1950 或 >当前年标记 abnormal |
| district | 映射重庆区县标准字典 | 映射失败进入待复核 |
| link | 生成 normalized_url | 无 ID 时参与 fingerprint |

## 12. 模型与分析边界

1. 必须至少实现：EDA、回归预测、KMeans 分层、异常检测。
2. 回归模型必须输出 MAE、RMSE、R²。
3. 聚类必须输出每一类的样本量、均价、面积、楼龄等画像。
4. 异常检测必须输出异常房源列表和判定理由。
5. 趋势分析只能基于已有 crawl_time/snapshot_time，不得伪造多年趋势。
6. 模型结果必须写入 `model_results` 或可追踪 JSON 文件。

## 13. Vibe Coding 任务卡模板

```text
任务名称：

G｜Goal：
只写一个明确目标。

O｜Output：
列出需要新增/修改的文件、API、页面、脚本、测试。

A｜Acceptance：
列出必须运行的命令、接口示例、SQL 检查、页面检查点。

L｜Limits：
允许修改：
禁止修改：
禁止行为：

完成后必须输出：
1. 修改摘要
2. 关键实现
3. 自验收结果
4. 风险与下一步
```

## 14. 示例任务卡

```text
任务名称：实现房源分页查询 API

G｜Goal：
实现 GET /api/listings，支持 district、price_min、price_max、area_min、area_max、keyword、page、page_size。

O｜Output：
- backend/api/listings.py
- backend/services/listing_service.py
- backend/models/listing.py
- backend/tests/test_listings_api.py

A｜Acceptance：
- pytest backend/tests/test_listings_api.py 通过。
- curl /api/listings?page=1&page_size=20 返回统一格式。
- district、price、area、keyword 筛选有效。

L｜Limits：
允许修改：backend/api/listings.py, backend/services/listing_service.py, backend/models/listing.py, backend/tests/test_listings_api.py
禁止修改：backend/crawlers, backend/agent, frontend
禁止行为：不得在 route 层拼接复杂 SQL；不得改数据库表结构。
```

## 15. 最终高分验收证据清单

开发完成后必须准备以下答辩证据：

1. MySQL `listings` 表超过 50,000 条有效记录的截图。
2. 重庆各区县样本覆盖统计截图。
3. 采集任务日志截图，包括成功页、失败页、错误类型。
4. 增量更新截图：重复采集不重复入库，价格变化进入快照表。
5. Dashboard 截图：KPI、区县排行、价格分布、散点、趋势图。
6. 模型结果截图：MAE/RMSE/R²、特征重要性、聚类画像、异常列表。
7. Agent 工具调用截图：用户问题、工具参数、工具返回 JSON、最终回答。
8. 生成报告截图：报告内容和 evidence_json。
9. 阿里云部署截图：公网地址、Nginx、Gunicorn/systemd、MySQL 状态。
10. README 中的一键启动/部署说明。

## 16. 停止条件

Codex/Cursor 遇到以下情况必须停止并向用户说明，不得继续猜测实现：

1. 数据库表结构与当前任务需要不一致。
2. 缺少必要环境变量、API Key 或数据库连接信息。
3. 目标网站页面结构变化导致解析规则无法确认。
4. 测试失败且原因不明确。
5. 用户任务要求 Agent 执行任意 SQL、绕过验证码、强对抗反爬或编造数据。
6. 需要跨多个模块大改，但任务卡未授权。

## 17. 最终实现口径

本项目面向重庆市二手房挂牌价数据，构建一个支持多源采集、增量维护、数据质量监控、可解释建模、交互式可视化和 Agent 智能分析报告生成的后台管理式数据产品。系统以 MySQL 为数据中枢，以确定性数据工程保证数据可信，以机器学习模型支撑分析结论，以 DeepSeek Agent 降低问数和报告生成成本，形成从数据源到原型系统的完整闭环。
