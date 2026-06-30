import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export type ChongqingMapMetric = "avgPrice" | "count" | "quality";

export interface District {
  name: string;
  avgPrice: number;
  count: number;
  change: number;
  quality: number;
}

interface ChongqingHeatMapProps {
  metric?: ChongqingMapMetric;
  data?: District[];
  selectedDistrict?: string | null;
  onSelectDistrict?: (district: District | null) => void;
  height?: number;
}

const METRIC_META: Record<ChongqingMapMetric, { label: string; unit: string; minLabel: string; maxLabel: string; desc: string }> = {
  avgPrice: { label: "挂牌均价", unit: "元/㎡", minLabel: "低价区", maxLabel: "高价区", desc: "近30日挂牌均价" },
  count: { label: "样本量", unit: "套", minLabel: "低密度", maxLabel: "高密度", desc: "有效挂牌房源数" },
  quality: { label: "质量评分", unit: "分", minLabel: "较低", maxLabel: "较高", desc: "数据完整度评分" },
};

const MAIN_CITY_DISTRICTS = new Set([
  "渝中区", "江北区", "渝北区", "南岸区", "沙坪坝区",
  "九龙坡区", "大渡口区", "巴南区", "北碚区",
]);

const DISTRICT_SHORT_LABELS: Record<string, string> = {
  万州区: "万州",
  涪陵区: "涪陵",
  渝中区: "渝中",
  大渡口区: "大渡口",
  江北区: "江北",
  沙坪坝区: "沙坪坝",
  九龙坡区: "九龙坡",
  南岸区: "南岸",
  北碚区: "北碚",
  渝北区: "渝北",
  巴南区: "巴南",
  长寿区: "长寿",
  江津区: "江津",
  合川区: "合川",
  永川区: "永川",
  南川区: "南川",
  璧山区: "璧山",
  铜梁区: "铜梁",
  潼南区: "潼南",
  荣昌区: "荣昌",
  开州区: "开州",
  梁平区: "梁平",
  武隆区: "武隆",
  黔江区: "黔江",
  城口县: "城口",
  丰都县: "丰都",
  垫江县: "垫江",
  忠县: "忠县",
  云阳县: "云阳",
  奉节县: "奉节",
  巫山县: "巫山",
  巫溪县: "巫溪",
  石柱土家族自治县: "石柱",
  秀山土家族苗族自治县: "秀山",
  酉阳土家族苗族自治县: "酉阳",
  彭水苗族土家族自治县: "彭水",
  两江新区: "两江新区",
};

function metricValue(district: District, metric: ChongqingMapMetric) {
  if (metric === "count") return district.count;
  if (metric === "quality") return district.quality;
  return district.avgPrice;
}

function formatMetric(value: number, metric: ChongqingMapMetric) {
  if (metric === "quality") return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

function shortDistrictName(name: string) {
  return DISTRICT_SHORT_LABELS[name] ?? name.replace(/土家族苗族自治县|苗族土家族自治县|土家族自治县/g, "").replace(/[区县]$/, "");
}

function buildTooltip(params: any, metric: ChongqingMapMetric, meta: typeof METRIC_META.avgPrice, districtByName: Map<string, District>) {
  const districtName = params.name;
  const district = districtByName.get(districtName);
  const isMainCity = MAIN_CITY_DISTRICTS.has(districtName);

  if (!district) {
    return `<div style="min-width:180px;padding:4px 0;font-size:13px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px;">
        <strong style="font-size:14px;color:#111827;">${districtName}</strong>
        ${isMainCity ? '<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:1px 6px;border-radius:999px;">主城</span>' : '<span style="font-size:10px;background:#F3F4F6;color:#6B7280;padding:1px 6px;border-radius:999px;">区县</span>'}
      </div>
      <div style="font-size:12px;color:#9CA3AF;text-align:center;padding:12px 0;">
        暂无该区县采集数据<br/>
        <span style="font-size:11px;">可进入采集任务进行补采</span>
      </div>
    </div>`;
  }

  const districtValue = metricValue(district, metric);
  const changeIcon = district.change > 0 ? "↑" : district.change < 0 ? "↓" : "—";
  const changeColor = district.change > 0 ? "#DC2626" : district.change < 0 ? "#16A34A" : "#6B7280";
  const changeText = district.change === 0 ? "暂无变化" : `${changeIcon} ${Math.abs(district.change).toFixed(2)}%`;

  const metricColor = metric === "avgPrice" ? "#DC2626" : metric === "count" ? "#2563EB" : "#16A34A";

  return `<div style="min-width:200px;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;border-bottom:1px solid #F3F4F6;padding-bottom:6px;">
      <strong style="font-size:15px;color:#111827;">${districtName}</strong>
      ${isMainCity ? '<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:1px 6px;border-radius:999px;">主城九区</span>' : ""}
    </div>
    <div style="font-size:12px;color:#374151;line-height:2;">
      <div style="display:flex;justify-content:space-between;align-items:center;background:#F8FAFC;padding:6px 8px;border-radius:6px;margin-bottom:4px;">
        <span style="color:#4B5563;font-weight:500;">${meta.label}</span>
        <strong style="color:${metricColor};font-size:14px;">${formatMetric(districtValue, metric)} ${meta.unit}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6B7280;">挂牌均价</span>
        <span style="color:#1F2937;font-weight:500;">${district.avgPrice?.toLocaleString() ?? "—"} 元/㎡</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6B7280;">采集样本</span>
        <span style="color:#1F2937;font-weight:500;">${district.count?.toLocaleString() ?? 0} 套</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6B7280;">环比变化</span>
        <span style="color:${changeColor};font-weight:600;">${changeText}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6B7280;">质量评分</span>
        <span style="color:#1F2937;">${(district.quality ?? 0).toFixed(1)} 分</span>
      </div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #E5E7EB;font-size:10px;color:#9CA3AF;text-align:center;">
      点击区县查看详细数据
    </div>
  </div>`;
}

export function ChongqingHeatMap({
  metric = "avgPrice",
  data,
  selectedDistrict,
  onSelectDistrict,
  height = 285,
}: ChongqingHeatMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [districtCenters, setDistrictCenters] = useState<Record<string, [number, number]>>({});
  const districts = useMemo(() => data ?? [], [data]);

  const districtByName = useMemo(
    () => new Map(districts.map(item => [item.name, item])),
    [districts]
  );

  const chartData = useMemo(
    () =>
      districts.map(item => ({
        name: item.name,
        value: metricValue(item, metric),
        avgPrice: item.avgPrice,
        count: item.count,
        change: item.change,
        quality: item.quality,
      })),
    [districts, metric]
  );

  const selectedMarkerData = useMemo(() => {
    if (!selectedDistrict) {
      return [];
    }
    const center = districtCenters[selectedDistrict];
    const district = districtByName.get(selectedDistrict);
    if (!center || !district) {
      return [];
    }
    return [{
      name: district.name,
      value: [center[0], center[1], metricValue(district, metric)],
      avgPrice: district.avgPrice,
      count: district.count,
      change: district.change,
      quality: district.quality,
    }];
  }, [districtByName, districtCenters, metric, selectedDistrict]);

  const valueRange = useMemo(() => {
    const values = chartData.map(item => Number(item.value)).filter(Number.isFinite);
    if (values.length === 0) {
      return { min: 0, max: 1 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      min,
      max: min === max ? min + 1 : max,
    };
  }, [chartData]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    let disposed = false;
    fetch("/geo/chongqing.json")
      .then(response => {
        if (!response.ok) throw new Error(`地图资源加载失败: ${response.status}`);
        return response.json();
      })
      .then(geoJson => {
        if (disposed) return;
        echarts.registerMap("chongqing", geoJson);
        const centers = Object.fromEntries(
          (geoJson.features ?? [])
            .map((feature: any) => {
              const center = feature?.properties?.center ?? feature?.properties?.centroid;
              const name = feature?.properties?.name;
              if (!name || !Array.isArray(center) || center.length < 2) {
                return null;
              }
              return [name, [Number(center[0]), Number(center[1])] as [number, number]];
            })
            .filter(Boolean),
        ) as Record<string, [number, number]>;
        setDistrictCenters(centers);
        setMapReady(true);
      })
      .catch(error => {
        if (!disposed) setMapError(error instanceof Error ? error.message : "地图资源加载失败");
      });

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mapReady) return;

    const meta = METRIC_META[metric];

    const option: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        borderColor: "#E2E8F0",
        borderWidth: 1,
        backgroundColor: "rgba(255,255,255,0.98)",
        padding: [10, 14],
        textStyle: { color: "#374151", fontSize: 12 },
        extraCssText: "border-radius:10px; box-shadow: 0 4px 24px rgba(0,0,0,0.10);",
        formatter: params => buildTooltip(params, metric, METRIC_META[metric], districtByName),
      },
      geo: {
        map: "chongqing",
        roam: true,
        zoom: 1.1,
        scaleLimit: { min: 1, max: 8 },
        top: 16,
        bottom: 48,
        left: 8,
        right: 8,
        silent: false,
        itemStyle: {
          areaColor: "#F1F5F9",
          borderColor: "#CBD5E1",
          borderWidth: 0.6,
        },
        emphasis: { disabled: true },
      },
      visualMap: {
        min: valueRange.min,
        max: valueRange.max,
        left: 12,
        bottom: 8,
        orient: "horizontal",
        calculable: false,
        itemWidth: 12,
        itemHeight: 80,
        itemGap: 6,
        text: [meta.maxLabel, meta.minLabel],
        textStyle: { color: "#6B7280", fontSize: 11 },
        inRange: {
          color: ["#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A"],
        },
        formatter: value => `${formatMetric(Number(value), metric)} ${meta.unit}`,
      },
      series: [
        {
          name: meta.label,
          type: "map",
          map: "chongqing",
          geoIndex: 0,
          selectedMode: "single",
          roam: true,
          scaleLimit: { min: 1, max: 8 },
          zoom: 1.1,
          top: 16,
          bottom: 48,
          left: 8,
          right: 8,
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              color: "#1E3A8A",
              fontWeight: 700,
              fontSize: 13,
              backgroundColor: "rgba(255,255,255,0.95)",
              borderRadius: 8,
              padding: [4, 10],
              formatter: p => shortDistrictName(p.name),
            },
            itemStyle: {
              areaColor: "#FCD34D",
              borderColor: "#F59E0B",
              borderWidth: 2.5,
              shadowBlur: 12,
              shadowColor: "rgba(245,158,11,0.45)",
            },
          },
          select: {
            label: {
              show: true,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 12,
              backgroundColor: "rgba(30,58,138,0.85)",
              borderRadius: 8,
              padding: [4, 10],
              formatter: p => shortDistrictName(p.name),
            },
            itemStyle: {
              areaColor: "#1D4ED8",
              borderColor: "#BFDBFE",
              borderWidth: 2,
            },
          },
          itemStyle: {
            borderColor: "#ffffff",
            borderWidth: 1.2,
            areaColor: "#EFF6FF",
            shadowBlur: 4,
            shadowColor: "rgba(30,64,175,0.08)",
          },
          data: chartData,
        },
        {
          name: "选中区县脉冲",
          type: "effectScatter",
          coordinateSystem: "geo",
          geoIndex: 0,
          zlevel: 5,
          data: selectedMarkerData,
          symbolSize: 14,
          showEffectOn: "render",
          rippleEffect: {
            scale: 4,
            brushType: "stroke",
            period: 2.5,
          },
          itemStyle: {
            color: "#F59E0B",
            borderColor: "#ffffff",
            borderWidth: 2.5,
            shadowBlur: 16,
            shadowColor: "rgba(245,158,11,0.40)",
          },
          label: {
            show: true,
            position: "top",
            distance: 10,
            color: "#1E3A8A",
            backgroundColor: "rgba(255,255,255,0.95)",
            borderColor: "#BFDBFE",
            borderWidth: 1,
            borderRadius: 999,
            padding: [5, 10],
            fontSize: 12,
            fontWeight: 700,
            formatter: params => {
              const d = params.data as any;
              return `${shortDistrictName(params.name)} ${d?.count?.toLocaleString() ?? 0}套`;
            },
          },
          emphasis: { scale: true },
        },
      ],
    };

    chart.setOption(option, true);
    if (selectedDistrict) {
      chart.dispatchAction({ type: "select", name: selectedDistrict });
    }

    chart.off("click");
    chart.on("click", params => {
      const district = districtByName.get(params.name);
      onSelectDistrict?.(district ?? null);
    });
  }, [chartData, districtByName, mapReady, metric, onSelectDistrict, selectedDistrict, selectedMarkerData, valueRange.max, valueRange.min]);

  const meta = METRIC_META[metric];

  if (mapError) {
    return (
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ height, background: "#F8FAFC", border: "1.5px dashed #CBD5E1" }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#94A3B8", fontSize: 14, marginBottom: 4 }}>地图加载失败</div>
          <div style={{ color: "#9CA3AF", fontSize: 12 }}>{mapError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {!mapReady && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl"
          style={{ background: "rgba(248,250,252,0.88)", backdropFilter: "blur(2px)" }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%", border: "2.5px solid #BFDBFE",
              borderTopColor: "#3B82F6", animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ color: "#6B7280", fontSize: 13, marginTop: 10 }}>
            正在加载地图...
          </span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />

      <div
        className="flex items-center justify-between"
        style={{ fontSize: 11, color: "#9CA3AF", paddingTop: 6, paddingLeft: 2 }}
      >
        <div className="flex items-center gap-3">
          <span>{meta.desc}</span>
        </div>
        <span style={{ color: "#6B7280" }}>滚轮缩放 · 拖动平移</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
