# 重庆二手房源挂牌价数据分析与智能可视化系统

本项目面向“重庆市二手房源挂牌价数据分析与可视化”课程设计，提供从采集任务、MySQL 数据底座、数据清洗质量评估、增量快照、分析建模、可视化 Dashboard 到智能问答报告的完整演示系统。

> 注意：系统内所有价格均为二手房挂牌价/报价，不代表成交价，也不构成购房或投资建议。

## 1. 环境要求

- Python 3.8+
- Node.js 18+
- MySQL 8.x
- Windows PowerShell

后端默认数据库连接：

```text
mysql+pymysql://root:root@127.0.0.1:3306/real_estate?charset=utf8mb4
```

如果本机密码不同，请复制 `.env.example` 为 `.env` 后修改 `DATABASE_URL`。不要把 `.env` 提交或打包给别人。

## 2. 数据库导入

最终版数据库 SQL 位于：

```text
database/real_estate_final_20260701.sql
```

首次运行前执行：

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS real_estate DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p real_estate < database/real_estate_final_20260701.sql
```

导入后建议检查：

```sql
SELECT COUNT(*) FROM listings WHERE status IN ('active','valid');
SELECT COUNT(DISTINCT district) FROM listings;
SELECT COUNT(*) FROM listing_snapshots;
```

课程设计要求有效数据不少于 50,000 条；本地验收数据约 100,897 条，覆盖重庆 38 个区县。

## 3. 后端启动

```powershell
pip install -r requirements.txt
python -m flask --app Backend.app run --debug --port 5000
```

健康检查：

```powershell
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/overview
```

## 4. 前端启动

```powershell
cd Frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

浏览器打开：

```text
http://127.0.0.1:5173
```

默认登录账号：

```text
用户名：admin
密码：swu@2026
```

## 5. 功能清单

- 登录与基础权限：本地演示账号登录。
- 首页 Dashboard：KPI、重庆区县地图、区县均价、挂牌价趋势、面积-单价散点、总价分布、户型分布。
- 房源数据管理：分页表格、筛选、系统 ID 升序、详情弹窗、CSV 导出。
- 采集任务管理：多线程采集任务、任务进度、失败页与日志追踪、增量任务记录。
- 数据清洗质量：完整性、唯一性、一致性、及时性、有效性、可核验性六维质量评分。
- 分析建模：EDA、挂牌单价回归、KMeans 分层、异常检测、模型指标与可解释结果。
- 智能问答：Agent 通过白名单工具读取统计、模型、任务和报告数据，保存工具调用证据。
- 自然语言查数：复杂统计问题可由 DeepSeek 生成 MySQL `SELECT`，经 AST、表白名单、只读事务、5 秒超时和 100 行上限校验后执行。
- 系统设置：爬虫并发、调度、DeepSeek Key 提示与基础配置。

## 6. 验收命令

后端语法与测试：

```powershell
python -m compileall Backend
python -m pytest Backend/tests -q
```

核心接口：

```powershell
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/overview
curl "http://127.0.0.1:5000/api/listings?page=1&page_size=20"
curl "http://127.0.0.1:5000/api/charts/district-price?limit=38"
```

前端构建：

```powershell
cd Frontend
npm run build
```

## 7. 项目结构

```text
swu-cq-house-price-analysis/
├─ Backend/              # Flask API、服务层、模型、爬虫、Agent、测试
├─ Frontend/             # Vite + React 前端
├─ database/             # 最终版 MySQL 导出 SQL
├─ docs/                 # 测试报告、验收证据、项目说明资料
├─ scripts/              # 运行、导入、验收、质量重算等实用脚本
├─ requirements.txt      # Python 依赖
├─ .env.example          # 本地环境变量模板
└─ README.md             # 本文件
```

## 8. 说明边界

- 旧 SQLite/CSV 只作为冷启动导入源，运行期统一使用 MySQL。
- Agent 不持有 MySQL 连接，也不直接执行用户输入 SQL。自然语言查数由白名单工具生成并校验只读 `SELECT`，目前仅开放 `listings`、快照、采集、质量和分析结果等业务表。
- 禁止写操作、跨库查询、系统表、锁和危险函数；所有自然语言 SQL 查询都会记录生成 SQL、结果和工具调用证据。
- 模型结果用于解释挂牌价影响因素和辅助估价，不宣称精准预测成交价。
- 爬虫遵守普通请求、有限并发、随机间隔，不做验证码绕过或强对抗反爬。
