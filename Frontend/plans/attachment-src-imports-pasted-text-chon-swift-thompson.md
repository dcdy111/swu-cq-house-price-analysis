# 重庆二手房源价格数据分析与智能可视化系统 — UI 原型设计计划

## Context

附件 `AGENTS.md` 描述了后端系统的工程规范，附件 `chongqing-secondhand-housing-u.txt` 是给设计工具的高保真原型 brief：要求生成一个 7 页的 Web 后台 UI（西南大学蓝白科研风 + 重庆山城元素 + 房价分析场景）。本次任务范围为**前端高保真 UI 原型**（Figma Make / React + Tailwind + shadcn/ui + Recharts），不涉及后端、爬虫、MySQL、Agent 真实实现，全部用 mock 数据驱动，最终用于答辩/课程设计展示。

项目当前是一个空 Make 模板：`src/app/App.tsx` + `src/app/components/ui/*`（shadcn）。无 `@make-kits` 包。

## 设计令牌（写入 `src/styles/theme.css`）

```
--swu-deep:        #163A70   主色深蓝
--swu-brand:       #1F4E8C   品牌蓝
--swu-aux:         #4F7DBD   辅助蓝
--bg-page:         #F7F9FC
--bg-card:         #FFFFFF
--border-soft:     #E5EAF2
--text-primary:    #1F2937
--text-secondary:  #6B7280
--state-success:   #16A34A
--state-warn:      #F59E0B
--state-danger:    #DC2626
--cq-accent:       #E67E22   重庆暖橙
```
图表色板统一以蓝为主色阶 + 橙色强调；圆角 12px、轻阴影、8px 栅格。

## 整体布局

- `AppShell`：左侧 220px 深蓝侧栏 + 顶部 64px 导航 + 主内容卡片网格。
- 侧栏菜单：首页总览 / 房源数据管理 / 采集任务管理 / 分析建模 / 智能问答与报告 / 系统设置（图标用 `lucide-react`）。
- 顶部：系统名 + 全局搜索 + 数据更新时间 + 通知铃铛 + 用户胶囊 "admin / 研究员" + "系统运行中" 状态点。
- 路由：使用 `react-router` 的 `MemoryRouter`（参考 `make:react-router` 规范），登录页独立 layout，其余 6 页共用 AppShell。

## 文件结构

```
src/app/
├─ App.tsx                       # 路由 + AppShell 装配
├─ mock/
│  ├─ listings.ts                # 房源样例数据
│  ├─ districts.ts               # 重庆 38 区县字典 + 均价
│  ├─ trend.ts                   # 12 月趋势
│  ├─ crawlTasks.ts              # 采集任务 + 日志
│  ├─ model.ts                   # 特征重要性 / 聚类 / 异常
│  └─ chat.ts                    # 会话历史 + Tool trace
├─ components/
│  ├─ layout/
│  │  ├─ AppShell.tsx
│  │  ├─ Sidebar.tsx
│  │  └─ Topbar.tsx
│  ├─ common/
│  │  ├─ KpiCard.tsx
│  │  ├─ SectionCard.tsx
│  │  ├─ StatusTag.tsx           # success/warn/danger/info 统一色
│  │  ├─ SwuBadge.tsx            # 西大圆形徽章占位（SVG 线条）
│  │  └─ ChongqingSkyline.tsx    # 浅蓝重庆天际线/桥梁 SVG 线稿
│  ├─ charts/
│  │  ├─ DistrictRankBar.tsx     # 区县均价排行（Recharts BarChart）
│  │  ├─ PriceTrendLine.tsx      # 近 12 月趋势
│  │  ├─ AreaPriceScatter.tsx    # 面积-单价散点
│  │  ├─ LayoutDonut.tsx         # 户型环形
│  │  ├─ FeatureImportance.tsx   # Top10 横向柱
│  │  ├─ PredVsActualScatter.tsx
│  │  ├─ KMeansScatter.tsx
│  │  ├─ DistrictBoxPlot.tsx     # ComposedChart 模拟箱线
│  │  └─ ChongqingHeatMap.tsx    # SVG 仿区县热力图（非真 GeoJSON）
│  └─ pages/
│     ├─ LoginPage.tsx
│     ├─ DashboardPage.tsx
│     ├─ ListingsPage.tsx        # 含右侧详情 Sheet
│     ├─ CrawlTasksPage.tsx      # 含日志面板
│     ├─ AnalysisPage.tsx        # Tabs: EDA / 预测 / 聚类 / 异常 / 评估
│     ├─ AgentPage.tsx           # 三栏：历史 / 聊天 / Trace+报告
│     └─ SettingsPage.tsx        # Tabs: 基础/数据源/采集/调度/API/部署
└─ ...
```

复用：所有按钮/输入/表格/卡片/Tabs/Sheet/Switch/Dialog 从 `src/app/components/ui/*`（shadcn）取，避免重写。

## 七页要点（与 brief 对齐）

1. **登录** — 左侧 `ChongqingSkyline` SVG + "1906" 浅水印；右侧登录 Card（用户名/密码/记住我/登录/SSO）；顶部西大徽章 + "Southwest University"；页脚 © 2026 商贸学院。
2. **Dashboard** — 7 个 KPI Card（房源总数 128,645 等）；区县热力 SVG 图 + 排行柱 + 12 月趋势 + 散点 + 户型环形 + 采集状态条 + Agent 洞察卡。
3. **房源数据管理** — 顶部筛选条（区县/商圈/总价/单价/面积/户型/关键词 + 导出 CSV）；shadcn Table 含示例三行（融创凡尔赛 / 龙湖源著 / 金科十年城）；右侧 `Sheet` 详情抽屉（图片占位 + 标签）。
4. **采集任务管理** — 顶部 5 张统计卡；新建任务表单（数据源/范围/类型/并发/Cron）；任务列表（进度 Progress 条 + 状态标签）；底部日志面板（时间/级别/URL/原因，按 INFO/WARN/ERROR 着色）。
5. **分析建模** — Tabs 切换；指标卡 MAE/RMSE/R²/MAPE；特征重要性 Top10 + 预测散点 + KMeans + 箱线 + 异常表；右侧模型信息卡（XGBoost/RF/Ridge + 重新训练）。
6. **智能问答与报告** — 三栏 `ResizablePanelGroup`；左：会话历史；中：消息流（含证据来源块，区别于普通 Chat）；右：Tool Trace（query_market_stats 等 4 个工具调用步骤展开 JSON）+ 报告预览（标题 / 结论 / 图占位 / 下载 PDF / 导出 Word）。
7. **系统设置** — Tabs：基础 / 数据源（链家/贝壳/安居客/自定义 开关 + 测试连接）/ 采集 / 调度 Cron / DeepSeek API（掩码 Input）/ 部署信息（Flask + MySQL 8.0 + Vite + Ubuntu/Nginx/Gunicorn）。

## 关键实现要点

- **Recharts** 是已安装依赖，所有图表用它实现；箱线图与热力图用 `ComposedChart` + 自定义 SVG 近似（不引入新库）。
- **重庆地图**：SVG 手绘 38 区县色块的近似拓扑（非真实 GeoJSON），按均价染色 + tooltip。不强求地理精度，原型可读即可。
- **mock 数据**：所有数字与 brief 文案对齐（128,645 / 13,842 / 94.6 分 / MAE 1287.56 / R² 0.8421 等），保证截图答辩一致。
- **中文字体**：在 `src/styles/fonts.css` 顶部 `@import` 思源黑体（如不可用则系统字体回退 `PingFang SC, Microsoft YaHei`）。
- **不实现**：真实登录、真实爬虫、真实 Agent 接口、PDF 导出（按钮 onClick → Toast 提示 "演示模式"）。

## 验证

- 在 Make 预览中依次切到 7 个路由，确认布局无溢出、卡片对齐、图表渲染、Tabs/Sheet/Resizable 可交互。
- 桌面端为主（brief 是后台系统）；窄屏下侧栏折叠为图标条。
- 各状态色一致：运行中蓝 / 成功绿 / 警告橙 / 失败红。
- 答辩截图清单逐项核对（Dashboard / 房源表 / 采集日志 / 模型结果 / Agent Trace / 报告预览 / 设置）。
