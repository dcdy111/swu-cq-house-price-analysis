import { useState } from "react";
import { Search, Download, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { Badge } from "../ui/badge";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { LISTINGS, DISTRICT_OPTIONS, LAYOUT_OPTIONS, Listing } from "../../mock/listings";
import { toast } from "sonner";

export function ListingsPage() {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("全部区县");
  const [layout, setLayout] = useState("全部户型");
  const [selected, setSelected] = useState<Listing | null>(null);

  const filtered = LISTINGS.filter(l =>
    (district === "全部区县" || l.district === district) &&
    (layout === "全部户型" || l.layout === layout) &&
    (!search || l.title.includes(search) || l.address.includes(search))
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>房源数据管理</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>共 {LISTINGS.length.toLocaleString()} 条记录（演示数据）</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("演示模式 — 导出功能不可用")}
          className="flex items-center gap-2"
        >
          <Download size={14} />导出 CSV
        </Button>
      </div>

      {/* Filter bar */}
      <SectionCard>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <Input
              placeholder="搜索楼盘名称、地址..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
              style={{ fontSize: 13 }}
            />
          </div>
          <Select value={district} onValueChange={setDistrict}>
            <SelectTrigger className="w-36 h-9" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTRICT_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={layout} onValueChange={setLayout}>
            <SelectTrigger className="w-32 h-9" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>总价(万):</span>
            <Input placeholder="最低" className="w-20 h-9" style={{ fontSize: 12 }} />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>-</span>
            <Input placeholder="最高" className="w-20 h-9" style={{ fontSize: 12 }} />
          </div>
          <Button size="sm" style={{ background: "#163A70", color: "#fff", height: 36, fontSize: 13 }}>
            <SlidersHorizontal size={13} className="mr-1" />筛选
          </Button>
          {(search || district !== "全部区县" || layout !== "全部户型") && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDistrict("全部区县"); setLayout("全部户型"); }}>
              <X size={13} className="mr-1" />清除
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard noPad>
        <Table>
          <TableHeader>
            <TableRow style={{ background: "#F7F9FC" }}>
              <TableHead style={{ fontSize: 12 }}>ID</TableHead>
              <TableHead style={{ fontSize: 12 }}>楼盘名称</TableHead>
              <TableHead style={{ fontSize: 12 }}>区县</TableHead>
              <TableHead style={{ fontSize: 12 }}>户型</TableHead>
              <TableHead style={{ fontSize: 12 }}>面积(㎡)</TableHead>
              <TableHead style={{ fontSize: 12 }}>总价(万)</TableHead>
              <TableHead style={{ fontSize: 12 }}>单价(元/㎡)</TableHead>
              <TableHead style={{ fontSize: 12 }}>来源</TableHead>
              <TableHead style={{ fontSize: 12 }}>状态</TableHead>
              <TableHead style={{ fontSize: 12 }}>采集时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(l => (
              <TableRow
                key={l.id}
                className="cursor-pointer"
                style={{ fontSize: 13 }}
                onClick={() => setSelected(l)}
              >
                <TableCell style={{ color: "#9CA3AF", fontSize: 12 }}>{l.id}</TableCell>
                <TableCell style={{ fontWeight: 500, color: "#163A70" }}>{l.title}</TableCell>
                <TableCell>{l.district}</TableCell>
                <TableCell>{l.layout}</TableCell>
                <TableCell>{l.size}</TableCell>
                <TableCell style={{ color: "#E67E22", fontWeight: 600 }}>{l.totalPrice}</TableCell>
                <TableCell>{l.unitPrice.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" style={{ fontSize: 11 }}>{l.source}</Badge>
                </TableCell>
                <TableCell>
                  <StatusTag status={l.status} label={l.status === "active" ? "在售" : l.status === "sold" ? "已售" : "待确认"} />
                </TableCell>
                <TableCell style={{ color: "#9CA3AF", fontSize: 11 }}>{l.crawledAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent style={{ width: 420 }}>
          <SheetHeader>
            <SheetTitle style={{ color: "#163A70", fontSize: 16 }}>{selected?.title}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="flex flex-col gap-4 mt-4">
              {/* Image placeholder */}
              <div className="w-full h-48 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #163A70, #4F7DBD)" }}>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>房源图片占位</span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {selected.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-full" style={{ background: "#EFF6FF", color: "#1F4E8C", fontSize: 12 }}>{tag}</span>
                ))}
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["地址", selected.address],
                  ["区域", `${selected.district} · ${selected.area}`],
                  ["总价", `${selected.totalPrice} 万元`],
                  ["单价", `${selected.unitPrice.toLocaleString()} 元/㎡`],
                  ["面积", `${selected.size} ㎡`],
                  ["楼层", selected.floor],
                  ["建年", `${selected.buildYear} 年`],
                  ["来源", selected.source],
                  ["经纪人", selected.agent],
                  ["状态", selected.status === "active" ? "在售" : "已售"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{k}</span>
                    <span style={{ fontSize: 13, color: "#1F2937", fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <Button size="sm" style={{ background: "#163A70", color: "#fff", flex: 1, fontSize: 13 }}
                  onClick={() => toast.info("演示模式")}>
                  AI 估价
                </Button>
                <Button variant="outline" size="sm" style={{ flex: 1, fontSize: 13 }}
                  onClick={() => toast.info("演示模式")}>
                  相似房源
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
