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

const METRIC_META: Record<ChongqingMapMetric, { label: string; unit: string; minLabel: string; maxLabel: string }> = {
  avgPrice: { label: "挂牌均价", unit: "元/㎡", minLabel: "低价", maxLabel: "高价" },
  count: { label: "样本量", unit: "套", minLabel: "少", maxLabel: "多" },
  quality: { label: "质量分", unit: "分", minLabel: "较低", maxLabel: "较高" },
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
        borderColor: "#E5EAF2",
        backgroundColor: "rgba(255,255,255,0.97)",
        textStyle: { color: "#1F2937", fontSize: 12 },
        formatter: params => {
          const data = params.data as any;
          if (!data || typeof data.value !== "number") {
            return `${params.name}<br/>暂无采集样本`;
          }
          return [
            `<strong>${params.name}</strong>`,
            `挂牌均价：${data.avgPrice.toLocaleString()} 元/㎡`,
            `样本量：${data.count.toLocaleString()} 套`,
            `同比：${data.change > 0 ? "+" : ""}${data.change}%`,
            `质量分：${data.quality.toFixed(1)}`,
          ].join("<br/>");
        },
      },
      visualMap: {
        min: valueRange.min,
        max: valueRange.max,
        left: 14,
        bottom: 10,
        orient: "horizontal",
        calculable: false,
        itemWidth: 14,
        itemHeight: 160,
        text: [meta.maxLabel, meta.minLabel],
        textStyle: { color: "#6B7280", fontSize: 11 },
        inRange: {
          color: ["#DBEAFE", "#4F7DBD", "#163A70", "#E67E22"],
        },
        formatter: value => `${formatMetric(Number(value), metric)}${metric === "quality" ? "" : ""}`,
      },
      series: [
        {
          name: meta.label,
          type: "map",
          map: "chongqing",
          roam: true,
          selectedMode: "single",
          zoom: 1.12,
          top: 8,
          bottom: 32,
          left: 8,
          right: 8,
          label: {
            show: true,
            color: "#1F2937",
            fontSize: 9,
          },
          emphasis: {
            label: { show: true, color: "#163A70", fontWeight: 700 },
            itemStyle: { areaColor: "#F59E0B", borderColor: "#fff", borderWidth: 1.5 },
          },
          select: {
            label: { color: "#fff", fontWeight: 700 },
            itemStyle: { areaColor: "#E67E22", borderColor: "#163A70", borderWidth: 2 },
          },
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 0.7,
            areaColor: "#EEF2F7",
          },
          data: chartData,
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
  }, [chartData, districtByName, mapReady, metric, onSelectDistrict, selectedDistrict, valueRange.max, valueRange.min]);

  if (mapError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg" style={{ background: "#F7F9FC", border: "1px dashed #CBD5E1" }}>
        <span style={{ color: "#9CA3AF", fontSize: 13 }}>{mapError}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {!mapReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg" style={{ background: "rgba(247,249,252,0.82)" }}>
          <span style={{ color: "#6B7280", fontSize: 13 }}>正在加载重庆区县边界...</span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height }} />
      <div className="mt-1 flex items-center justify-between" style={{ fontSize: 11, color: "#9CA3AF" }}>
        <span>鼠标滚轮缩放，拖拽平移，点击区县查看统计</span>
        <span>{METRIC_META[metric].label}</span>
      </div>
    </div>
  );
}
