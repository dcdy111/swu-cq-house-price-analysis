export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url: string; excerpt: string }[];
  timestamp: string;
}

export interface ToolTrace {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration: number;
  status: "success" | "error";
}

export interface Session {
  id: string;
  title: string;
  preview: string;
  time: string;
  messageCount: number;
}

export const SESSIONS: Session[] = [
  { id: "S001", title: "渝北区房价趋势分析", preview: "近6个月渝北区均价下行0.5%...", time: "今天 10:30", messageCount: 8 },
  { id: "S002", title: "3室2厅性价比分析", preview: "综合考虑单价和配套设施...", time: "今天 09:15", messageCount: 5 },
  { id: "S003", title: "2026年重庆房价预测", preview: "基于XGBoost模型预测全年...", time: "昨天 16:40", messageCount: 12 },
  { id: "S004", title: "江北区学区房分析", preview: "学区因素对房价溢价约15%...", time: "昨天 14:20", messageCount: 6 },
  { id: "S005", title: "采集数据质量报告", preview: "本月采集完整率94.6%...", time: "06-07 11:00", messageCount: 4 },
];

export const MESSAGES: Message[] = [
  { id: "M001", role: "user", content: "帮我分析一下2026年上半年重庆二手房的价格走势，特别是渝北区和南岸区的对比。", timestamp: "10:28" },
  {
    id: "M002",
    role: "assistant",
    content: `根据我对数据库中 **128,645 套**有效房源的分析，2026年上半年重庆二手房价格呈稳中有升态势：

**总体走势**
- 全市均价从 13,180 元/㎡（1月）上涨至 14,120 元/㎡（6月），涨幅约 **7.1%**
- 成交量 Q1 环比 Q4 增长 **23.4%**，市场活跃度提升

**渝北区 vs 南岸区**
| 指标 | 渝北区 | 南岸区 |
|------|--------|--------|
| 当前均价 | 15,640 元/㎡ | 16,780 元/㎡ |
| 同比涨幅 | -0.5% ↓ | +2.5% ↑ |
| 在售房源 | 18,932套 | 10,982套 |

南岸区受弹子石CBD开发利好驱动，价格持续走强；渝北区供应充足，价格略有回调。

建议关注南岸区南滨路沿线次新房，性价比较高。`,
    sources: [
      { title: "链家重庆2026年H1市场报告", url: "#", excerpt: "全市二手房成交均价同比上涨6.8%，南岸区涨幅位居第三..." },
      { title: "重庆统计局房地产月报", url: "#", excerpt: "2026年5月重庆商品房销售面积同比增长11.2%..." },
    ],
    timestamp: "10:29",
  },
  { id: "M003", role: "user", content: "帮我生成一份完整的市场分析报告。", timestamp: "10:30" },
  {
    id: "M004",
    role: "assistant",
    content: "好的，我正在为您生成重庆二手房市场分析报告，已调用数据查询和模型预测工具，报告预计包含价格走势、区域对比、户型分析和投资建议四个部分。报告已生成，可在右侧面板查看并下载。",
    timestamp: "10:31",
  },
];

export const TOOL_TRACES: ToolTrace[] = [
  {
    id: "TR001",
    tool: "query_market_stats",
    input: { districts: ["渝北区", "南岸区"], dateRange: "2026-01 ~ 2026-06", metrics: ["avgPrice", "volume", "listing_count"] },
    output: { success: true, rows: 12, avgPrice_yuBei: 15640, avgPrice_nanAn: 16780, volume_total: 24766 },
    duration: 234,
    status: "success",
  },
  {
    id: "TR002",
    tool: "run_price_prediction",
    input: { model: "xgboost_v2.3.1", features: { district: "南岸区", size: 120, floor_ratio: 0.6, build_year: 2021 } },
    output: { predicted_unit_price: 16950, confidence_interval: [15200, 18700], r2: 0.842 },
    duration: 156,
    status: "success",
  },
  {
    id: "TR003",
    tool: "search_similar_listings",
    input: { district: "南岸区", price_range: [14000, 20000], layout: "3室2厅", size_range: [100, 150] },
    output: { count: 234, top3: ["龙湖源著", "融创滨江壹号", "中海观园"] },
    duration: 89,
    status: "success",
  },
  {
    id: "TR004",
    tool: "generate_report",
    input: { title: "2026年H1重庆二手房市场分析报告", sections: ["价格走势", "区域对比", "户型分析", "投资建议"], format: "pdf" },
    output: { report_id: "RPT_20260609_001", pages: 12, size_kb: 2048, status: "generated" },
    duration: 1823,
    status: "success",
  },
];
