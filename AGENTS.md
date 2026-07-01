# AGENTS.md｜Codex 开发规则

本文件只约束当前项目 `swu-cq-house-price-analysis`。它面向 Codex 使用，用来统一开发边界、目录结构、验收口径和停止条件；不要把这里的规则当成全局个人偏好。

## 1. 项目定位

项目名称：重庆二手房源挂牌价数据分析与智能可视化系统。

课程题目要求围绕“重庆市二手房源价格数据分析与可视化”完成一个可运行系统，必须覆盖：

1. 爬取重庆各区县二手房挂牌价数据，最终有效数据不少于 50,000 条。
2. 对数据进行清洗、整理并保存到数据库或文件中；本项目运行数据库统一采用 MySQL 8.x。
3. 支持定期更新，且更新时采用增量方式。
4. 使用 Web 形式展示多维可视化图表。
5. 使用挖掘算法进行分析，并输出可解释结论。
6. Web 系统运行稳定，界面科研简约、美观大方。
7. 技术和算法先进且合理，包括多线程采集、增量快照、数据质量监控、模型解释和 Agent 工具调用。

本项目不是继续修补 2025 年旧项目，而是在当前目录下重构一个层次清晰、前后端分离、能演示、能写进学年设计文档的新系统。旧项目只作为数据源、字段清洗、爬虫经验和冷启动数据参考。

## 2. 当前技术决策

### 2.1 前端

当前前端来自 Figma 下载代码，已经是 `React + Vite + TypeScript + shadcn/Radix 风格组件`，不是纯 HTML。

Codex 后续开发必须以现有 `Frontend` 目录为基础继续完善，不要再重建一套原生 HTML 前端。允许逐步清理 mock 数据并接入真实 API，但不要大面积重写视觉结构。

本地联调端口固定为：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:5000`

除非用户明确要求，不要切换到 `4173`、`5001` 等其他本地端口。若端口被占用，优先停止旧进程，而不是改端口继续开发。

前端重点：

- 保留后台管理式信息架构：Dashboard、房源数据管理、采集任务管理、分析建模、智能问答与报告、系统设置。
- 页面风格保持科研简约：白底、深蓝标题、浅灰分区、少量橙色强调。
- 数据图表优先使用已有 React 图表组件；如后续改用 ECharts，必须保持统一封装，不要把图表初始化逻辑散落在页面中。

### 2.2 后端

后端采用 `Flask API + SQLAlchemy + PyMySQL`，必须分层：

```text
Backend/
├─ app.py                  # create_app 入口
├─ config.py               # 环境变量与配置
├─ extensions.py           # db 等扩展
├─ api/                    # Blueprint 路由层
├─ models/                 # SQLAlchemy 模型
├─ services/               # 业务服务层
├─ crawlers/               # 数据源适配器和解析逻辑
├─ tasks/                  # 任务执行与调度
├─ ml/                     # 后续分析建模
├─ agent/                  # 后续 DeepSeek Agent
├─ tests/                  # 后端测试
└─ utils/                  # 响应、清洗、通用工具
```

路由层只负责参数读取和响应，不写复杂 SQL、不写爬虫解析、不写模型训练、不写 Agent 工具逻辑。

### 2.3 数据库

运行期数据库统一使用 MySQL 8.x。旧 SQLite/CSV 只能用于一次性冷启动导入，导入后业务接口不得再访问旧 SQLite。

后端自动化测试也使用 MySQL 测试库 `real_estate_test`，不使用 SQLite 内存库。测试可以清空测试库中的项目表，但不得清空正式库 `real_estate`。

## 3. 当前优先级

当前阶段先完成两个模块：

1. 房源数据管理
   - `GET /api/listings`
   - 分页、区县、来源、价格、面积、关键词筛选
   - 房源详情弹窗所需字段
   - CSV 导出
   - 旧 SQLite 冷启动导入脚本

2. 采集任务管理
   - `GET /api/crawl/sources`
   - `POST /api/crawl/tasks`
   - `GET /api/crawl/tasks`
   - `GET /api/crawl/tasks/{id}`
   - `POST /api/crawl/tasks/{id}/run`
   - 任务状态、日志、成功页、失败页、错误原因
   - 多线程采集，默认并发 3-5

暂缓：分析建模、Agent、部署脚本、完整 Dashboard。除非用户明确要求，不要在当前阶段顺手扩展这些模块。

## 4. 数据源策略

本项目研究对象是“重庆二手房挂牌价/报价”，不得写成“成交价”。

默认数据源策略：

- `fang`：房天下重庆二手房，当前页面可直接返回列表 HTML，优先作为默认可用源。
- `anjuke_mobile`：安居客移动端重庆二手房，页面可访问但 DOM/脚本结构可能波动，作为第二数据源，解析失败要记录日志而不是让任务崩溃。
- `lianjia`：链家重庆二手房当前常跳登录页，保留为实验源或需 Cookie 源，不作为默认任务源，不绕验证码、不强对抗反爬。

所有数据源必须保留 `source` 字段。同一房源可能跨平台出现，不允许简单按标题合并。去重主键以 `source + fingerprint` 为边界。

采集边界：

- 不绕过验证码、不模拟登录破解、不进行强对抗反爬。
- 默认请求随机间隔 1-3 秒。
- 默认 `MAX_WORKERS` 控制在 3-5。
- 单个页面失败只记录日志并继续其他页面，不能导致整个 Web 服务崩溃。

## 5. 数据模型要求

必须实现核心表：

- `listings`：标准房源主表。
- `listing_snapshots`：价格与状态快照。
- `crawl_tasks`：采集任务。
- `crawl_logs`：采集日志。

后续阶段再补：

- `data_quality_reports`
- `analysis_jobs`
- `model_results`
- `agent_tool_calls`
- `generated_reports`

`listings` 必须字段：

```text
id, source, source_listing_id, title, link, district, community,
total_price, unit_price, area, layout, rooms, halls,
orientation, decoration, floor_text, floor_level,
build_year, house_age, address, tags, fingerprint,
data_quality_score, status, first_seen_at, last_seen_at,
created_at, updated_at
```

增量规则：

1. `source + fingerprint` 不存在：插入 `listings`，并写第一条 `listing_snapshots`。
2. fingerprint 存在且价格未变化：只更新 `last_seen_at` 和必要字段。
3. fingerprint 存在且价格变化：更新 `listings` 当前价格，并追加 snapshot。
4. 连续多次未出现：后续任务标记为 inactive，不物理删除。
5. 异常字段保留，但通过 `data_quality_score` 和状态字段体现。

## 6. API 响应规范

所有业务接口统一返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "20260701-abcdef"
}
```

错误也必须保留 `trace_id`，便于日志和前端定位。

## 7. 代码约束

- 只能在当前项目目录内开发：`swu-cq-house-price-analysis`。
- 不要修改全局 `AGENTS.md`。
- 不要在路由层写复杂 SQL 或爬虫解析。
- 不要把前后端代码混在一个文件里。
- 不要把 `.env`、API Key、数据库密码提交到仓库。
- 不要用 Docker 作为第一版部署方案。
- 不要为了“更完整”跨多个模块大改。
- 文件删除默认不永久删除；确需删除时必须先说明并获得用户明确确认。

## 8. 测试与自验收

完成代码后优先运行：

```bash
python -m compileall Backend
pytest Backend/tests -q
python -m flask --app Backend.app run --debug --port 5000
npm run build
```

测试必须优先使用本地 MySQL。若 MySQL 服务不可用，必须先汇报环境阻塞，不得擅自切回 SQLite 并声称完成实库验收。

接口自测优先：

```bash
curl http://127.0.0.1:5000/api/health
curl "http://127.0.0.1:5000/api/listings?page=1&page_size=20"
curl http://127.0.0.1:5000/api/crawl/sources
curl http://127.0.0.1:5000/api/crawl/tasks
```

## 9. 每次完成后的回复格式

Codex 每次完成开发任务后必须输出：

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

## 10. 停止条件

遇到以下情况必须停止并说明，不要继续猜测：

1. 数据库表结构与当前任务严重不一致，且无法通过迁移或脚本补齐。
2. 缺少必要数据库连接信息，且任务必须访问真实 MySQL。
3. 目标网站页面结构变化导致解析规则无法确认。
4. 测试失败且原因不明确。
5. 用户要求 Agent 执行任意 SQL、绕过验证码、强对抗反爬或编造数据。
6. 需要跨多个模块大改，但当前任务没有授权。

## 11. 答辩证据导向

后续每个模块都要服务最终答辩证据：

1. MySQL `listings` 表超过 50,000 条有效记录。
2. 重庆各区县样本覆盖统计。
3. 采集任务日志，包括成功页、失败页、错误类型。
4. 增量更新：重复采集不重复入库，价格变化进入快照表。
5. Dashboard 截图：KPI、区县排行、价格分布、散点、趋势图。
6. 模型结果：MAE/RMSE/R2、特征重要性、聚类画像、异常列表。
7. Agent 工具调用：问题、工具参数、工具返回 JSON、最终回答。
8. 生成报告：报告内容和 evidence_json。
9. 阿里云部署：公网地址、Nginx、Gunicorn/systemd、MySQL 状态。
10. README 中的一键启动/部署说明。
