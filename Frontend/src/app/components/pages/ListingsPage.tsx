import { useEffect, useMemo, useState } from "react";
import { Search, Download, SlidersHorizontal, X, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { api, ListingItem, ListingOptions, listingsExportUrl } from "../../services/api";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  active: "在售",
  inactive: "下架",
  abnormal: "异常",
};

type FilterDraft = {
  keyword: string;
  district: string;
  source: string;
  priceMin: string;
  priceMax: string;
};

const DEFAULT_DRAFT: FilterDraft = {
  keyword: "",
  district: "全部区县",
  source: "全部来源",
  priceMin: "",
  priceMax: "",
};

function displayDistrictName(value?: string | null) {
  const text = String(value || "").trim();
  const aliases: Record<string, string> = {
    yubei: "渝北区",
    yuzhong: "渝中区",
    jiangbei: "江北区",
    nanan: "南岸区",
    nanana: "南岸区",
    "nan'an": "南岸区",
    jiulongpo: "九龙坡区",
    shapingba: "沙坪坝区",
    dadukou: "大渡口区",
    banan: "巴南区",
    beibei: "北碚区",
    dianjiangxian: "垫江县",
    dainjiangxian: "垫江县",
    wansheng: "万盛",
  };
  const normalized = aliases[text.toLowerCase()] || text;
  if (["两江新区", "渝北", "渝北区", "江北", "江北区"].includes(normalized)) {
    return "两江新区";
  }
  if (normalized === "万盛经开区") {
    return "万盛";
  }
  return normalized || "-";
}

export function ListingsPage() {
  const [items, setItems] = useState<ListingItem[]>([]);
  const [options, setOptions] = useState<ListingOptions>({ districts: [], sources: [] });
  const [selected, setSelected] = useState<ListingItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_DRAFT);
  const [applied, setApplied] = useState<FilterDraft>(DEFAULT_DRAFT);
  const [reloadKey, setReloadKey] = useState(0);

  const appliedParams = useMemo(
    () => ({
      page,
      page_size: 20,
      keyword: applied.keyword || undefined,
      district: applied.district === "全部区县" ? undefined : applied.district,
      source: applied.source === "全部来源" ? undefined : applied.source,
      price_min: applied.priceMin || undefined,
      price_max: applied.priceMax || undefined,
    }),
    [page, applied]
  );

  useEffect(() => {
    const applyPreset = () => {
      const preset = sessionStorage.getItem("listingSearch");
      if (!preset) return;
      const next: FilterDraft = { ...DEFAULT_DRAFT, keyword: preset };
      setDraft(next);
      setApplied(next);
      setPage(1);
      setReloadKey(x => x + 1);
      sessionStorage.removeItem("listingSearch");
    };
    applyPreset();
    window.addEventListener("listing-search", applyPreset);
    api.getListingOptions().then(setOptions).catch(() => {
      setOptions({ districts: [], sources: [] });
    });
    return () => window.removeEventListener("listing-search", applyPreset);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .getListings(appliedParams)
      .then(data => {
        setItems(data.items);
        setTotal(data.pagination.total);
        setPages(Math.max(1, data.pagination.pages || 1));
        setError(null);
      })
      .catch(fetchError => {
        const message = fetchError instanceof Error ? fetchError.message : "房源数据加载失败";
        setItems([]);
        setTotal(0);
        setPages(1);
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, [page, applied, reloadKey]);

  const submitFilters = () => {
    setApplied(draft);
    setPage(1);
    setReloadKey(x => x + 1);
  };

  const handleReset = () => {
    setDraft(DEFAULT_DRAFT);
    setApplied(DEFAULT_DRAFT);
    setPage(1);
    setReloadKey(x => x + 1);
  };

  const hasActiveFilter =
    Boolean(draft.keyword) ||
    draft.district !== "全部区县" ||
    draft.source !== "全部来源" ||
    Boolean(draft.priceMin) ||
    Boolean(draft.priceMax);

  const exportCsv = () => {
    if (error) {
      toast.error("当前房源接口异常，不能导出 CSV");
      return;
    }
    window.open(listingsExportUrl(appliedParams), "_blank");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>房源数据管理</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>
            共 {total.toLocaleString()} 条记录 · 数据来自 MySQL listings 表
          </p>
          <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>
            系统ID仅用于数据库定位，不代表业务编号或采集顺序；业务检索请优先看来源房源ID与原始链接。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setReloadKey(x => x + 1)} className="flex items-center gap-2">
            <RefreshCw size={14} />刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={Boolean(error) || loading}
            className="flex items-center gap-2"
          >
            <Download size={14} />导出 CSV
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}
        >
          房源接口加载失败：{error}。当前页面不会切换到演示数据，请恢复后端连接后刷新。
        </div>
      )}

      <SectionCard>
        <form
          onSubmit={event => {
            event.preventDefault();
            submitFilters();
          }}
          className="flex flex-wrap gap-3 items-center"
        >
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <Input
              placeholder="搜索标题、小区、地址、链接..."
              value={draft.keyword}
              onChange={event => setDraft(prev => ({ ...prev, keyword: event.target.value }))}
              className="pl-9 h-9"
              style={{ fontSize: 13 }}
            />
          </div>
          <Select
            value={draft.district}
            onValueChange={value => setDraft(prev => ({ ...prev, district: value }))}
          >
            <SelectTrigger className="w-36 h-9" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["全部区县", ...options.districts].map(d => (
                <SelectItem key={d} value={d}>
                  {d === "全部区县" ? d : displayDistrictName(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.source}
            onValueChange={value => setDraft(prev => ({ ...prev, source: value }))}
          >
            <SelectTrigger className="w-36 h-9" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["全部来源", ...options.sources].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>总价(万):</span>
            <Input
              value={draft.priceMin}
              onChange={event => setDraft(prev => ({ ...prev, priceMin: event.target.value.replace(/[^\d.]/g, "") }))}
              placeholder="最低"
              className="w-20 h-9"
              style={{ fontSize: 12 }}
            />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>-</span>
            <Input
              value={draft.priceMax}
              onChange={event => setDraft(prev => ({ ...prev, priceMax: event.target.value.replace(/[^\d.]/g, "") }))}
              placeholder="最高"
              className="w-20 h-9"
              style={{ fontSize: 12 }}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            style={{ background: "#163A70", color: "#fff", height: 36, fontSize: 13 }}
          >
            <SlidersHorizontal size={13} className="mr-1" />筛选
          </Button>
          {hasActiveFilter && (
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <X size={13} className="mr-1" />清除
            </Button>
          )}
        </form>
        <div className="mt-2" style={{ fontSize: 11, color: "#9CA3AF" }}>
          已应用：
          {[applied.keyword ? `关键词「${applied.keyword}」` : null,
            applied.district !== "全部区县" ? `区县 ${displayDistrictName(applied.district)}` : null,
            applied.source !== "全部来源" ? `来源 ${applied.source}` : null,
            (applied.priceMin || applied.priceMax) ? `总价 ${applied.priceMin || "0"}-${applied.priceMax || "∞"} 万` : null,
          ].filter(Boolean).join(" · ") || "无筛选条件（导出 CSV 与当前表完全一致）"}
        </div>
      </SectionCard>

      <SectionCard noPad>
        <Table>
          <TableHeader>
            <TableRow style={{ background: "#F7F9FC" }}>
              <TableHead style={{ fontSize: 12 }}>系统ID</TableHead>
              <TableHead style={{ fontSize: 12 }}>房源标题</TableHead>
              <TableHead style={{ fontSize: 12 }}>来源房源ID</TableHead>
              <TableHead style={{ fontSize: 12 }}>区县</TableHead>
              <TableHead style={{ fontSize: 12 }}>户型</TableHead>
              <TableHead style={{ fontSize: 12 }}>面积(㎡)</TableHead>
              <TableHead style={{ fontSize: 12 }}>总价(万)</TableHead>
              <TableHead style={{ fontSize: 12 }}>单价(元/㎡)</TableHead>
              <TableHead style={{ fontSize: 12 }}>来源</TableHead>
              <TableHead style={{ fontSize: 12 }}>质量分</TableHead>
              <TableHead style={{ fontSize: 12 }}>状态</TableHead>
              <TableHead style={{ fontSize: 12 }}>最近采集</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={12} style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 32 }}>
                  正在加载房源数据...
                </TableCell>
              </TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 32 }}>
                  暂无房源数据，可先在“采集任务管理”中新建一次小规模试采集。
                </TableCell>
              </TableRow>
            )}
            {!loading && items.map(item => (
              <TableRow key={item.id} className="cursor-pointer" style={{ fontSize: 13 }} onClick={() => setSelected(item)}>
                <TableCell style={{ color: "#9CA3AF", fontSize: 12 }}>{item.id}</TableCell>
                <TableCell style={{ fontWeight: 500, color: "#163A70", maxWidth: 320 }}>
                  <div className="truncate">{item.title}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 11 }}>{item.community || item.address || "未识别小区"}</div>
                </TableCell>
                <TableCell style={{ color: "#6B7280", fontSize: 12, maxWidth: 180 }}>
                  <div className="truncate">{item.source_listing_id || "—"}</div>
                </TableCell>
                <TableCell>{displayDistrictName(item.district)}</TableCell>
                <TableCell>{item.layout || "-"}</TableCell>
                <TableCell>{item.area ?? "-"}</TableCell>
                <TableCell style={{ color: "#E67E22", fontWeight: 600 }}>{item.total_price ?? "-"}</TableCell>
                <TableCell>{item.unit_price ? Math.round(item.unit_price).toLocaleString() : "-"}</TableCell>
                <TableCell><Badge variant="outline" style={{ fontSize: 11 }}>{item.source}</Badge></TableCell>
                <TableCell>{item.data_quality_score}</TableCell>
                <TableCell><StatusTag status={item.status} label={STATUS_LABEL[item.status] || item.status} /></TableCell>
                <TableCell style={{ color: "#9CA3AF", fontSize: 11 }}>{item.last_seen_at || item.updated_at || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #E5EAF2" }}>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>第 {page} / {pages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>下一页</Button>
          </div>
        </div>
      </SectionCard>

      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#163A70", fontSize: 16 }}>{selected?.title}</DialogTitle>
            <DialogDescription>
              数据来自后端 MySQL listings 与 listing_snapshots 表的当前快照，仅展示挂牌价数据
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {(selected.tags.length ? selected.tags : ["无标签"]).map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-full" style={{ background: "#EFF6FF", color: "#1F4E8C", fontSize: 12 }}>{tag}</span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["小区", selected.community || "未识别"],
                  ["地址", selected.address || "未识别"],
                  ["区域", displayDistrictName(selected.district)],
                  ["来源房源ID", selected.source_listing_id || "—"],
                  ["总价", selected.total_price ? `${selected.total_price} 万元` : "-"],
                  ["单价", selected.unit_price ? `${Math.round(selected.unit_price).toLocaleString()} 元/㎡` : "-"],
                  ["面积", selected.area ? `${selected.area} ㎡` : "-"],
                  ["户型", selected.layout || "-"],
                  ["楼层", selected.floor_text || "-"],
                  ["建年", selected.build_year ? `${selected.build_year} 年` : "-"],
                  ["房龄", selected.house_age ? `${selected.house_age} 年` : "-"],
                  ["来源", selected.source],
                  ["质量分", `${selected.data_quality_score}`],
                  ["系统ID", `${selected.id}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{k}</span>
                    <span style={{ fontSize: 13, color: "#1F2937", fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
                <div className="col-span-2 flex flex-col gap-0.5">
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>原始链接</span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "#1F2937",
                      fontWeight: 500,
                      wordBreak: "break-all",
                      overflowWrap: "anywhere",
                      lineHeight: 1.6,
                    }}
                  >
                    {selected.link || "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={!selected?.link}
              style={{ fontSize: 13 }}
              onClick={() => selected?.link && window.open(selected.link, "_blank")}
            >
              打开原始页面
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} style={{ fontSize: 13 }}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
