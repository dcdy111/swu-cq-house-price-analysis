export interface CrawlTask {
  id: string;
  name: string;
  source: "链家" | "贝壳" | "安居客" | "自定义";
  status: "running" | "success" | "failed" | "pending" | "paused";
  progress: number;
  total: number;
  crawled: number;
  startTime: string;
  endTime?: string;
  cron: string;
  concurrency: number;
  type: "全量" | "增量";
  range: string;
}

export const CRAWL_TASKS: CrawlTask[] = [
  { id: "T001", name: "链家全市全量采集", source: "链家", status: "running", progress: 67, total: 50000, crawled: 33500, startTime: "2026-06-09 06:00", cron: "0 6 * * *", concurrency: 8, type: "全量", range: "重庆全市" },
  { id: "T002", name: "贝壳渝北渝中增量", source: "贝壳", status: "success", progress: 100, total: 12000, crawled: 12000, startTime: "2026-06-09 07:00", endTime: "2026-06-09 08:43", cron: "0 7 * * *", concurrency: 5, type: "增量", range: "渝北区,渝中区" },
  { id: "T003", name: "安居客南岸江北增量", source: "安居客", status: "failed", progress: 34, total: 8000, crawled: 2720, startTime: "2026-06-09 08:00", endTime: "2026-06-09 08:32", cron: "0 8 * * *", concurrency: 4, type: "增量", range: "南岸区,江北区" },
  { id: "T004", name: "链家两江新区专项", source: "链家", status: "pending", progress: 0, total: 9500, crawled: 0, startTime: "2026-06-09 12:00", cron: "0 12 * * *", concurrency: 6, type: "全量", range: "两江新区" },
  { id: "T005", name: "贝壳全市增量同步", source: "贝壳", status: "paused", progress: 28, total: 35000, crawled: 9800, startTime: "2026-06-08 22:00", cron: "0 22 * * *", concurrency: 10, type: "增量", range: "重庆全市" },
];

export interface LogEntry {
  id: number;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  taskId: string;
  url: string;
  message: string;
}

export const LOG_ENTRIES: LogEntry[] = [
  { id: 1, time: "08:32:01", level: "ERROR", taskId: "T003", url: "https://cq.anjuke.com/sale/n-1/", message: "请求超时 (timeout=30s)，已重试3次" },
  { id: 2, time: "08:31:45", level: "WARN", taskId: "T003", url: "https://cq.anjuke.com/sale/n-2/", message: "反爬检测触发，触发频率限制" },
  { id: 3, time: "08:30:12", level: "INFO", taskId: "T003", url: "https://cq.anjuke.com/sale/", message: "开始采集 南岸区 页面，共估计480页" },
  { id: 4, time: "08:43:22", level: "INFO", taskId: "T002", url: "https://cq.lianjia.com/ershoufang/", message: "采集完成，共获取 12,000 条记录，入库成功" },
  { id: 5, time: "08:12:05", level: "INFO", taskId: "T002", url: "https://cq.lianjia.com/ershoufang/pg50/", message: "解析第50页，获取30条房源" },
  { id: 6, time: "08:05:30", level: "WARN", taskId: "T002", url: "https://cq.lianjia.com/ershoufang/pg22/", message: "部分字段缺失: floor, buildYear" },
  { id: 7, time: "07:50:11", level: "INFO", taskId: "T001", url: "https://cq.lianjia.com/ershoufang/pg180/", message: "累计采集 33,500 条，当前进度 67%" },
  { id: 8, time: "07:30:00", level: "INFO", taskId: "T001", url: "https://cq.lianjia.com/ershoufang/pg100/", message: "解析第100页成功，队列剩余 392 页" },
];
