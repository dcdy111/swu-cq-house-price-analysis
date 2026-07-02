# AGENTS.md｜重庆二手房源挂牌价数据分析与智能可视化系统

本文件只约束当前仓库 `swu-cq-house-price-analysis`，用于后续 Codex / Cursor / Vibe Coding Agent 在本项目中继续维护、修复和轻量优化。

## 1. 当前项目状态

项目已完成答辩版闭环，现有模块包括：

- 登录与 Dashboard
- 房源数据管理
- 采集任务管理
- 数据质量评估
- 分析建模
- 智能问答与报告
- 系统设置
- Nginx + Gunicorn + systemd + MySQL 生产部署

后续默认任务应以修 bug、轻量优化、文档维护、验收补强为主，不要推倒重做，也不要无授权跨模块重构。

## 2. 运行基线

- Python 3.10+（项目根目录统一使用 `.venv`）
- Volta（前端 Node.js / npm 版本固定）
- MySQL 8.x
- 本地前端：`http://127.0.0.1:5173`
- 本地后端：`http://127.0.0.1:5000`
- 数据库初始化 SQL：`database/real_estate_final_20260702.sql`

推荐命令：

```powershell
$env:PYTHON_EXE="C:\Path\python.exe"
powershell -ExecutionPolicy Bypass -File .\scripts\setup_local.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_dev.ps1
```

说明：

- `scripts/setup_local.ps1` 会在项目根目录创建或复用 `.venv`
- Python 依赖默认走清华镜像
- 前端依赖默认走 `Frontend/.npmrc` 中的国内镜像
- `Frontend/package.json` 的 `volta` 字段固定 Node / npm 版本

生产环境口径固定为 `Nginx + Gunicorn + systemd + MySQL`，不要再引入 Docker 作为第一版运行方案。

## 3. 目录职责

```text
Backend/                 Flask API、服务层、模型、采集、分析、Agent、测试
Frontend/                Vite + React 前端
database/                MySQL SQL 导出
docs/                    报告、证据、交付文档、参考资料
scripts/                 初始化、联调、导入、验收、文档生成脚本
README.md                新用户启动说明
requirements.txt         Python 依赖清单
```

`docs/` 目录默认结构：

- `docs/reports/`：测试与验收报告
- `docs/evidence/`：截图与 JSON 证据
- `docs/deliverables/`：最终提交材料
- `docs/references/`：原始需求与参考文档
- `docs/notes/`：迭代说明与清理记录

## 4. 不可违反的业务边界

1. 所有价格口径必须写成“挂牌价/报价”，不能写成“成交价”。
2. 运行期数据库只能使用 MySQL，旧 SQLite/CSV 只能作为冷启动导入源。
3. Flask route 只做参数接收和响应组装，不在路由层写复杂 SQL、爬虫逻辑、模型训练逻辑或 Agent 编排逻辑。
4. Agent 只能调用白名单工具，不能执行用户输入的任意 SQL，不能编造数值。
5. 采集必须使用确定性程序，禁止验证码绕过、强对抗反爬和危险自动化策略。
6. 分析建模输出必须可解释，带指标或证据，不能宣传“精准预测成交价”。

## 5. 修改边界

- 优先小范围、可验证的修改。
- 不要无原因更换技术栈、端口、目录结构或部署方式。
- 修改数据库结构时，必须同步 SQL 说明、迁移口径或导出说明。
- 维护文档时，保持 `README.md`、`docs/README.md` 和实际目录一致。
- 删除本地文件默认先移动到 Windows 回收站；除非用户明确要求永久删除。
- 不要回滚用户已有改动，不要擅自清理与当前任务无关的业务代码。

## 6. 最低验收标准

完成后优先执行：

```powershell
python -m compileall Backend
python -m pytest Backend/tests -q
cd Frontend
npm run build
```

接口最小检查：

```powershell
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/overview
```

如果任务涉及服务器部署，还应额外检查：

```bash
systemctl restart swu-cq-house-price-analysis
systemctl is-active swu-cq-house-price-analysis
curl http://127.0.0.1/api/health
```

## 7. 默认验收重点

- 页面是否能正常打开
- 接口是否返回统一 JSON 结构
- 采集任务、分析任务、Agent 是否仍可跑通
- 文档、SQL 导出、依赖清单是否与当前版本一致
- 新用户按 `README.md` 是否能完成安装和启动

## 8. 完成后的回复格式

每次任务结束后必须输出：

```text
1. 修改摘要
2. 关键实现
3. 自验收结果
4. 风险与下一步
```

## 9. 停止条件

遇到以下情况应停止硬试并说明：

1. 缺少真实数据库连接信息，且任务必须访问 MySQL。
2. 目标网站页面结构变化，采集规则无法确认。
3. 测试失败但原因不明确。
4. 用户要求执行任意 SQL、绕过验证码、编造数据或大面积重构多个模块。
5. 需要删除重要文件，但用户未明确确认删除策略。
