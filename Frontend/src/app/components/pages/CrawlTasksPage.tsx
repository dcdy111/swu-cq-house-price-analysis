import { useState } from "react";
import { Plus, Play, Pause, RotateCcw, Trash2, Terminal } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { KpiCard } from "../common/KpiCard";
import { CRAWL_TASKS, LOG_ENTRIES } from "../../mock/crawlTasks";
import { toast } from "sonner";
import { Activity, CheckCircle, AlertCircle, Clock, Database } from "lucide-react";

const LOG_COLOR: Record<string, string> = {
  INFO: "#1F4E8C",
  WARN: "#F59E0B",
  ERROR: "#DC2626",
};

const LOG_BG: Record<string, string> = {
  INFO: "#EFF6FF",
  WARN: "#FFFBEB",
  ERROR: "#FEF2F2",
};

export function CrawlTasksPage() {
  const [logFilter, setLogFilter] = useState<string>("ALL");

  const filteredLogs = logFilter === "ALL" ? LOG_ENTRIES : LOG_ENTRIES.filter(l => l.level === logFilter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>采集任务管理</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>管理数据源采集任务 · 实时监控运行状态</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button style={{ background: "#163A70", color: "#fff", fontSize: 13, height: 36 }}>
              <Plus size={14} className="mr-1.5" />新建任务
            </Button>
          </DialogTrigger>
          <DialogContent style={{ maxWidth: 500 }}>
            <DialogHeader>
              <DialogTitle>新建采集任务</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 mt-2">
              {[
                { label: "任务名称", placeholder: "例: 链家全量采集" },
              ].map(({ label, placeholder }) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>{label}</Label>
                  <Input placeholder={placeholder} style={{ fontSize: 13 }} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>数据源</Label>
                  <Select defaultValue="链家">
                    <SelectTrigger style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["链家", "贝壳", "安居客", "自定义"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>采集类型</Label>
                  <Select defaultValue="增量">
                    <SelectTrigger style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["全量", "增量"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>采集范围</Label>
                  <Input placeholder="重庆全市" style={{ fontSize: 13 }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>并发数</Label>
                  <Input type="number" defaultValue="5" style={{ fontSize: 13 }} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label style={{ fontSize: 13 }}>Cron 表达式</Label>
                <Input defaultValue="0 6 * * *" style={{ fontSize: 13, fontFamily: "monospace" }} />
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>例: 0 6 * * * 表示每天06:00执行</span>
              </div>
              <Button style={{ background: "#163A70", color: "#fff", fontSize: 13 }} onClick={() => toast.success("任务已创建（演示模式）")}>
                创建任务
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { title: "运行中", value: "1", icon: <Activity size={16} style={{ color: "#1F4E8C" }} /> },
          { title: "已完成", value: "1", icon: <CheckCircle size={16} style={{ color: "#16A34A" }} /> },
          { title: "已失败", value: "1", icon: <AlertCircle size={16} style={{ color: "#DC2626" }} /> },
          { title: "待运行", value: "1", icon: <Clock size={16} style={{ color: "#9CA3AF" }} /> },
          { title: "今日采集", value: "48,220", icon: <Database size={16} style={{ color: "#E67E22" }} /> },
        ].map(({ title, value, icon }) => (
          <KpiCard key={title} title={title} value={value} icon={icon} />
        ))}
      </div>

      {/* Task list */}
      <SectionCard title="任务列表">
        <div className="flex flex-col gap-3">
          {CRAWL_TASKS.map(task => (
            <div key={task.id} className="p-4 rounded-xl" style={{ border: "1px solid #E5EAF2" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{task.name}</span>
                    <StatusTag status={task.status} label={{ running: "运行中", success: "成功", failed: "失败", pending: "待运行", paused: "已暂停" }[task.status]} />
                    <span className="px-2 py-0.5 rounded" style={{ background: "#F7F9FC", fontSize: 11, color: "#6B7280" }}>{task.type}</span>
                  </div>
                  <div className="flex gap-4 mb-2" style={{ fontSize: 12, color: "#9CA3AF" }}>
                    <span>来源: {task.source}</span>
                    <span>范围: {task.range}</span>
                    <span>并发: {task.concurrency}</span>
                    <span>Cron: <code style={{ fontFamily: "monospace" }}>{task.cron}</code></span>
                  </div>
                  {task.status === "running" || task.progress > 0 ? (
                    <div className="flex items-center gap-3">
                      <Progress value={task.progress} className="flex-1 h-2" style={{ "--tw-bg": "#E5EAF2" } as React.CSSProperties} />
                      <span style={{ fontSize: 12, color: "#6B7280", minWidth: 60 }}>
                        {task.crawled.toLocaleString()} / {task.total.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: task.status === "running" ? "#163A70" : "#9CA3AF", fontWeight: 600 }}>{task.progress}%</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {task.status === "running" ? (
                    <Button variant="outline" size="sm" onClick={() => toast.info("演示模式")}><Pause size={12} /></Button>
                  ) : task.status !== "success" ? (
                    <Button variant="outline" size="sm" onClick={() => toast.info("演示模式")}><Play size={12} /></Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => toast.info("演示模式")}><RotateCcw size={12} /></Button>
                  <Button variant="outline" size="sm" onClick={() => toast.info("演示模式")}><Trash2 size={12} /></Button>
                </div>
              </div>
              {task.startTime && (
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                  开始: {task.startTime}{task.endTime ? ` · 结束: ${task.endTime}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Log panel */}
      <SectionCard
        title="系统日志"
        subtitle="实时采集日志"
        action={
          <div className="flex gap-1">
            {["ALL", "INFO", "WARN", "ERROR"].map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className="px-2.5 py-1 rounded text-xs transition-colors"
                style={{ background: logFilter === f ? "#163A70" : "#F7F9FC", color: logFilter === f ? "#fff" : "#6B7280" }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        <div className="rounded-lg overflow-hidden" style={{ background: "#0F172A", fontFamily: "monospace" }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "#1E293B" }}>
            <Terminal size={13} style={{ color: "#64748B" }} />
            <span style={{ fontSize: 12, color: "#64748B" }}>crawler.log</span>
          </div>
          <div className="p-3 flex flex-col gap-1 max-h-64 overflow-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {filteredLogs.map(log => (
              <div key={log.id} className="flex gap-3 items-start py-0.5">
                <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>{log.time}</span>
                <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0" style={{ background: LOG_BG[log.level] + "22", color: LOG_COLOR[log.level] }}>
                  {log.level}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>[{log.taskId}]</span>
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>{log.message}</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>{log.url}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
