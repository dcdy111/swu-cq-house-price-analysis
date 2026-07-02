# 重庆二手房源挂牌价数据分析与智能可视化系统

本项目用于完成“重庆市二手房源挂牌价数据分析与可视化”学年设计，覆盖数据采集、MySQL 存储、增量快照、数据质量评估、分析建模、智能问答和可视化展示的完整闭环。

> 系统内所有价格均表示二手房挂牌价/报价，不代表成交价，也不构成购房建议。

## 1. 环境要求

- Python 3.10+
- Volta（前端 Node.js / npm 由 Volta 固定版本管理）
- MySQL 8.x
- Windows PowerShell（本地脚本默认按 Windows 编写）

推荐先用项目自带脚本完成本地初始化：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_local.ps1
```

该脚本会：

- 在项目根目录创建或复用 `.venv`
- 从 `.env.example` 创建本地 `.env`（若不存在）
- 从 `Frontend/.env.example` 创建 `Frontend/.env.local`（若不存在）
- 通过国内镜像安装 `requirements.txt` 中的 Python 依赖
- 在 `Frontend/` 下通过国内镜像执行 `npm ci`

如果系统默认 `python` 不是 3.10+，可以先指定解释器再执行脚本：

```powershell
$env:PYTHON_EXE="C:\Path\python.exe"
powershell -ExecutionPolicy Bypass -File .\scripts\setup_local.ps1
```

前端的 Node.js / npm 版本固定在 `Frontend/package.json` 的 `volta` 字段中。首次执行前请确保本机已安装 Volta。

## 2. 本地配置

真实数据库密码、DeepSeek Key、采集 Cookie、高德 Key 只放在以下本地文件，不要提交：

- `.env`
- `Frontend/.env.local`
- `data/cookies/`（若自行扩展）

默认数据库连接示例：

```text
mysql+pymysql://root:root@127.0.0.1:3306/real_estate?charset=utf8mb4
```

如果本机 MySQL 账号或密码不同，请修改 `.env` 中的 `DATABASE_URL` 与 `TEST_DATABASE_URL`。

## 3. 数据库导入

当前仓库附带的最终版 SQL 导出文件：

```text
database/real_estate_final_20260702.sql
```

首次运行前执行：

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS real_estate DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p real_estate < database/real_estate_final_20260702.sql
```

导入后建议检查：

```sql
SELECT COUNT(*) FROM listings WHERE status IN ('active','valid');
SELECT COUNT(DISTINCT district) FROM listings;
SELECT COUNT(*) FROM listing_snapshots;
```

## 4. 启动方式

### 方式 A：一键本地联调

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_dev.ps1
```

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:5000`

### 方式 B：手动启动

后端：

```powershell
.\.venv\Scripts\python.exe -m flask --app Backend.app run --debug --host 127.0.0.1 --port 5000
```

前端：

```powershell
cd Frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

如果需要启用 Playwright 采集回退源，再额外安装浏览器内核：

```powershell
.\.venv\Scripts\python.exe -m playwright install chromium
```

## 5. 默认登录

```text
用户名：admin
密码：swu@2026
```

仅用于课程设计演示。本地或生产环境如继续使用，请及时修改 `.env` 中的登录配置。

## 6. 核心功能

- Dashboard：KPI、区县均价、趋势、分布、散点和地图展示
- 房源数据管理：分页查询、筛选、详情、CSV 导出
- 采集任务管理：多线程采集、日志追踪、增量任务记录
- 数据质量评估：完整性、唯一性、一致性、及时性、有效性、可核验性
- 分析建模：EDA、回归预测、聚类分析、异常检测、在线试算
- 智能问答：DeepSeek + 白名单工具调用 + 报告导出
- 系统设置：调度、采集并发、Agent 配置、基础运维开关

## 7. 自验收命令

后端检查：

```powershell
python -m compileall Backend
python -m pytest Backend/tests -q
```

前端构建：

```powershell
cd Frontend
npm run build
```

接口检查：

```powershell
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/overview
curl "http://127.0.0.1:5000/api/listings?page=1&page_size=20"
curl "http://127.0.0.1:5000/api/charts/district-price?limit=38"
```

## 8. 目录说明

```text
swu-cq-house-price-analysis/
├─ Backend/              # Flask API、服务层、模型、采集、分析、Agent、测试
├─ Frontend/             # Vite + React 前端
├─ database/             # MySQL 初始化 SQL 导出
├─ docs/                 # 测试报告、证据材料、交付文档、参考资料
├─ scripts/              # 初始化、联调、导入、校验等脚本
├─ requirements.txt      # Python 依赖
├─ .env.example          # 后端环境变量模板
├─ AGENTS.md             # 项目内 AI 开发约束
└─ README.md             # 本说明
```

`docs/` 的整理索引见 [docs/README.md](/D:/桌面/大二下学期期末考试/学年设计/swu-cq-house-price-analysis/docs/README.md)。

## 9. 部署口径

生产环境采用：

- `Nginx + Gunicorn + systemd + MySQL`

不使用 Docker 作为第一版部署方案。部署时仍然以 MySQL 为唯一运行数据库，旧 SQLite/CSV 仅作冷启动导入源。

## 10. 说明边界

- Agent 不直接执行用户输入 SQL，不直连数据库做任意查询。
- 自然语言查数只允许受控白名单表和只读 `SELECT`。
- 模型结果用于解释挂牌价影响因素和辅助估计，不宣称精准预测成交价。
- 采集遵守有限并发和正常访问边界，不做验证码绕过或强对抗反爬。
