import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export type ChongqingMapMetric = "avgPrice" | "count" | "quality";
export type ChongqingMapBackend = "amap" | "geojson";

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
  onBackendChange?: (backend: ChongqingMapBackend) => void;
  height?: number;
}

type GeoJsonFeature = {
  geometry?: {
    type?: string;
    coordinates?: number[][][][];
  };
  properties?: {
    name?: string;
    center?: [number, number];
    centroid?: [number, number];
  };
};

type GeoJsonData = {
  features?: GeoJsonFeature[];
};

type AMapNamespace = {
  InfoWindow: new (options?: Record<string, any>) => any;
  Map: new (container: HTMLElement, options?: Record<string, any>) => any;
  Marker: new (options?: Record<string, any>) => any;
  Pixel: new (x: number, y: number) => any;
  Polygon: new (options?: Record<string, any>) => any;
};

declare global {
  interface Window {
    AMap?: AMapNamespace;
    AMapLoader?: {
      load: (options: Record<string, any>) => Promise<AMapNamespace>;
    };
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    __cqAmapLoaderPromise?: Promise<AMapNamespace>;
  }
}

const AMAP_KEY = (import.meta as any).env?.VITE_AMAP_WEB_KEY as string | undefined;
const AMAP_SECURITY_CODE = (import.meta as any).env?.VITE_AMAP_SECURITY_CODE as string | undefined;
const AMAP_LOADER_URL = "https://webapi.amap.com/loader.js";
const GEOJSON_URL = "/geo/chongqing.json";
const CHONGQING_CENTER: [number, number] = [107.76, 29.68];
const MAP_COLORS = ["#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A"];
const MAP_VIEW_ANIM_MS = 680;

const METRIC_META: Record<
  ChongqingMapMetric,
  { label: string; unit: string; minLabel: string; maxLabel: string; desc: string }
> = {
  avgPrice: { label: "挂牌均价", unit: "元/㎡", minLabel: "低价区", maxLabel: "高价区", desc: "近30日挂牌均价" },
  count: { label: "样本量", unit: "套", minLabel: "低密度", maxLabel: "高密度", desc: "有效挂牌房源数" },
  quality: { label: "质量评分", unit: "分", minLabel: "较低", maxLabel: "较高", desc: "数据完整度评分" },
};

const MAIN_CITY_DISTRICTS = new Set([
  "渝中区",
  "江北区",
  "渝北区",
  "南岸区",
  "沙坪坝区",
  "九龙坡区",
  "大渡口区",
  "巴南区",
  "北碚区",
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

/** 快启慢停，比线性更丝滑，又不会像 cubicInOut 那样两头都拖沓 */
function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function startSmoothMapView(
  map: any,
  targetZoom: number,
  targetCenter: [number, number],
  duration = MAP_VIEW_ANIM_MS,
): () => void {
  let frameId: number | null = null;

  const cancel = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  if (!map?.getZoom || !map?.getCenter) {
    map?.setZoomAndCenter?.(targetZoom, targetCenter, false, duration);
    return cancel;
  }

  const startZoom = Number(map.getZoom());
  const startCenter = map.getCenter();
  const startLng = Number(startCenter?.lng ?? targetCenter[0]);
  const startLat = Number(startCenter?.lat ?? targetCenter[1]);
  const startedAt = performance.now();

  const step = (now: number) => {
    const raw = Math.min(1, (now - startedAt) / duration);
    const progress = easeOutCubic(raw);
    const lng = startLng + (targetCenter[0] - startLng) * progress;
    const lat = startLat + (targetCenter[1] - startLat) * progress;
    const zoom = startZoom + (targetZoom - startZoom) * progress;
    map.setZoomAndCenter?.(zoom, [lng, lat], true);
    if (progress < 1) {
      frameId = requestAnimationFrame(step);
    } else {
      frameId = null;
    }
  };

  frameId = requestAnimationFrame(step);
  return cancel;
}

function buildTooltip(
  params: { name: string },
  metric: ChongqingMapMetric,
  meta: typeof METRIC_META.avgPrice,
  districtByName: Map<string, District>
) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function interpolateColor(from: string, to: string, ratio: number) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

function getMetricColor(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return "#E5E7EB";
  if (max <= min) return MAP_COLORS[MAP_COLORS.length - 1];

  const ratio = clamp((value - min) / (max - min), 0, 1);
  const scaled = ratio * (MAP_COLORS.length - 1);
  const index = Math.min(Math.floor(scaled), MAP_COLORS.length - 2);
  const remainder = scaled - index;
  return interpolateColor(MAP_COLORS[index], MAP_COLORS[index + 1], remainder);
}

function buildDistrictCenters(geoJson: GeoJsonData) {
  return Object.fromEntries(
    (geoJson.features ?? [])
      .map(feature => {
        const center = feature?.properties?.center ?? feature?.properties?.centroid;
        const name = feature?.properties?.name;
        if (!name || !Array.isArray(center) || center.length < 2) {
          return null;
        }
        return [name, [Number(center[0]), Number(center[1])] as [number, number]];
      })
      .filter(Boolean)
  ) as Record<string, [number, number]>;
}

function loadExternalScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("高德 Loader 脚本加载失败")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("高德 Loader 脚本加载失败")), { once: true });
    document.head.appendChild(script);
  });
}

async function loadAmap() {
  if (!AMAP_KEY) {
    throw new Error("未配置高德 Web Key");
  }
  if (window.AMap?.Map) {
    return window.AMap;
  }
  if (window.__cqAmapLoaderPromise) {
    return window.__cqAmapLoaderPromise;
  }

  if (AMAP_SECURITY_CODE) {
    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
  }

  const loaderPromise = (async () => {
    await loadExternalScript(AMAP_LOADER_URL, "cq-amap-loader-script");
    if (!window.AMapLoader?.load) {
      throw new Error("高德 Loader 未就绪");
    }
    return window.AMapLoader.load({
      key: AMAP_KEY,
      version: "2.0",
    });
  })();

  window.__cqAmapLoaderPromise = loaderPromise.catch(error => {
    window.__cqAmapLoaderPromise = undefined;
    throw error;
  });

  return window.__cqAmapLoaderPromise;
}

export function ChongqingHeatMap({
  metric = "avgPrice",
  data,
  selectedDistrict,
  onSelectDistrict,
  onBackendChange,
  height = 285,
}: ChongqingHeatMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const amapRef = useRef<any>(null);
  const amapDistrictPolygonsRef = useRef<Array<{ name: string; polygons: any[] }>>([]);
  const amapInfoWindowRef = useRef<any>(null);
  const amapSelectionMarkerRef = useRef<any>(null);
  const geoJsonRef = useRef<GeoJsonData | null>(null);
  const didFitViewRef = useRef(false);
  const prevSelectedDistrictRef = useRef<string | null>(null);
  const amapViewAnimCancelRef = useRef<(() => void) | null>(null);

  const [activeBackend, setActiveBackend] = useState<ChongqingMapBackend>(AMAP_KEY ? "amap" : "geojson");
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
    onBackendChange?.(activeBackend);
  }, [activeBackend, onBackendChange]);

  useEffect(() => {
    let disposed = false;
    const resizeObserver = new ResizeObserver(() => {
      chartRef.current?.resize();
      amapRef.current?.resize?.();
    });

    const destroyChart = () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };

    const destroyAmapLayer = () => {
      amapSelectionMarkerRef.current?.setMap?.(null);
      amapSelectionMarkerRef.current = null;
      for (const group of amapDistrictPolygonsRef.current) {
        for (const polygon of group.polygons) {
          polygon?.setMap?.(null);
        }
      }
      amapDistrictPolygonsRef.current = [];
      amapInfoWindowRef.current?.close?.();
      amapInfoWindowRef.current = null;
    };

    const destroyAmap = () => {
      destroyAmapLayer();
      amapRef.current?.destroy?.();
      amapRef.current = null;
    };

    const initEcharts = (geoJson: GeoJsonData) => {
      if (!containerRef.current) {
        throw new Error("地图容器不存在");
      }
      destroyAmap();
      destroyChart();
      containerRef.current.innerHTML = "";
      const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
      chartRef.current = chart;
      echarts.registerMap("chongqing", geoJson as Record<string, any>);
      setActiveBackend("geojson");
      setMapReady(true);
      setMapError(null);
    };

    const initAmap = async (geoJson: GeoJsonData) => {
      if (!containerRef.current) {
        throw new Error("地图容器不存在");
      }

      const AMap = await loadAmap();
      if (disposed) {
        return;
      }

      destroyChart();
      destroyAmap();
      containerRef.current.innerHTML = "";

      const map = new AMap.Map(containerRef.current, {
        center: CHONGQING_CENTER,
        zoom: 7,
        mapStyle: "amap://styles/whitesmoke",
        resizeEnable: true,
        dragEnable: true,
        zoomEnable: true,
        jogEnable: false,
        doubleClickZoom: true,
        features: ["bg", "road", "point"],
      });

      amapRef.current = map;
      setActiveBackend("amap");
      setMapReady(true);
      setMapError(null);
    };

    const init = async () => {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      setMapReady(false);
      setMapError(null);

      try {
        const response = await fetch(GEOJSON_URL);
        if (!response.ok) {
          throw new Error(`地图资源加载失败: ${response.status}`);
        }
        const geoJson = await response.json();
        if (disposed) {
          return;
        }

        geoJsonRef.current = geoJson;
        setDistrictCenters(buildDistrictCenters(geoJson));

        if (AMAP_KEY) {
          try {
            await initAmap(geoJson);
            return;
          } catch (error) {
            console.warn("高德底图加载失败，已回退到本地 GeoJSON：", error);
          }
        }

        initEcharts(geoJson);
      } catch (error) {
        if (!disposed) {
          destroyChart();
          destroyAmap();
          setMapReady(false);
          setMapError(error instanceof Error ? error.message : "地图资源加载失败");
        }
      }
    };

    init();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      destroyChart();
      destroyAmap();
    };
  }, []);

  useEffect(() => {
    if (activeBackend !== "amap" || !mapReady || !geoJsonRef.current || !amapRef.current || !window.AMap) {
      return;
    }

    const AMap = window.AMap;
    const map = amapRef.current;
    const meta = METRIC_META[metric];

    amapSelectionMarkerRef.current?.setMap?.(null);
    amapSelectionMarkerRef.current = null;
    for (const group of amapDistrictPolygonsRef.current) {
      for (const polygon of group.polygons) {
        polygon?.setMap?.(null);
      }
    }
    amapDistrictPolygonsRef.current = [];

    const getDistrictStyle = (districtName: string, hovered = false) => {
      const district = districtByName.get(districtName);
      const fillColor = district ? getMetricColor(metricValue(district, metric), valueRange.min, valueRange.max) : "#E5E7EB";
      const isSelected = selectedDistrict === districtName;
      return {
        strokeColor: isSelected ? "#1D4ED8" : hovered ? "#F59E0B" : "#FFFFFF",
        strokeWeight: isSelected ? 3 : hovered ? 2.2 : 1.2,
        fillColor,
        fillOpacity: isSelected ? 0.96 : district ? (hovered ? 0.9 : 0.76) : 0.3,
        cursor: "pointer",
        bubble: true,
        zIndex: isSelected ? 60 : hovered ? 40 : 20,
      };
    };

    const ensureInfoWindow = () => {
      if (!amapInfoWindowRef.current) {
        amapInfoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -6),
          closeWhenClickMap: true,
          isCustom: false,
        });
      }
      return amapInfoWindowRef.current;
    };

    const polygonGroups = (geoJsonRef.current.features ?? [])
      .map(feature => {
        const districtName = feature?.properties?.name ?? "";
        const multiPolygon = feature?.geometry?.coordinates ?? [];
        if (!districtName || !Array.isArray(multiPolygon) || multiPolygon.length === 0) {
          return null;
        }

        const polygons = multiPolygon.map(polygonCoordinates => new AMap.Polygon({
          path: polygonCoordinates,
          ...getDistrictStyle(districtName),
        }));

        const applyStyle = (hovered = false) => {
          for (const polygon of polygons) {
            polygon.setOptions(getDistrictStyle(districtName, hovered));
          }
        };

        for (const polygon of polygons) {
          polygon.on("mouseover", (event: any) => {
            applyStyle(true);
            const infoWindow = ensureInfoWindow();
            infoWindow.setContent(buildTooltip({ name: districtName }, metric, meta, districtByName));
            const center = districtCenters[districtName] ?? CHONGQING_CENTER;
            infoWindow.open(map, event?.lnglat ?? center);
          });

          polygon.on("mousemove", (event: any) => {
            const infoWindow = ensureInfoWindow();
            if (event?.lnglat) {
              infoWindow.setPosition(event.lnglat);
            }
          });

          polygon.on("mouseout", () => {
            applyStyle(false);
            amapInfoWindowRef.current?.close?.();
          });

          polygon.on("click", () => {
            const district = districtByName.get(districtName);
            onSelectDistrict?.(district ?? null);
          });
        }

        return { name: districtName, polygons };
      })
      .filter(Boolean) as Array<{ name: string; polygons: any[] }>;

    amapDistrictPolygonsRef.current = polygonGroups;
    map.add(polygonGroups.flatMap(group => group.polygons));

    if (!didFitViewRef.current) {
      map.setFitView?.();
      didFitViewRef.current = true;
    }

    if (selectedDistrict && selectedMarkerData.length > 0) {
      const marker = new AMap.Marker({
        position: [selectedMarkerData[0].value[0], selectedMarkerData[0].value[1]],
        offset: new AMap.Pixel(0, -18),
        anchor: "bottom-center",
        content: `
          <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
            <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.96);border:1px solid #BFDBFE;border-radius:999px;padding:6px 10px;box-shadow:0 8px 20px rgba(15,23,42,0.12);white-space:nowrap;">
              <span style="width:8px;height:8px;border-radius:999px;background:#F59E0B;box-shadow:0 0 0 6px rgba(245,158,11,0.18);animation:pulse 1.8s ease-in-out infinite;"></span>
              <span style="font-size:12px;line-height:1;color:#163A70;font-weight:700;">${shortDistrictName(selectedMarkerData[0].name)} ${selectedMarkerData[0].count.toLocaleString()}套</span>
            </div>
          </div>
        `,
      });
      marker.setMap(map);
      amapSelectionMarkerRef.current = marker;
    }

    if (selectedDistrict !== prevSelectedDistrictRef.current) {
      amapViewAnimCancelRef.current?.();
      if (selectedDistrict && districtCenters[selectedDistrict]) {
        const center = districtCenters[selectedDistrict];
        amapViewAnimCancelRef.current = startSmoothMapView(map, 8.2, center, MAP_VIEW_ANIM_MS);
      } else if (prevSelectedDistrictRef.current) {
        amapViewAnimCancelRef.current = startSmoothMapView(map, 7.4, CHONGQING_CENTER, MAP_VIEW_ANIM_MS);
      }
      prevSelectedDistrictRef.current = selectedDistrict ?? null;
    }
  }, [
    activeBackend,
    districtByName,
    districtCenters,
    mapReady,
    metric,
    onSelectDistrict,
    selectedDistrict,
    selectedMarkerData,
    valueRange.max,
    valueRange.min,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mapReady || activeBackend !== "geojson") return;

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
        formatter: params => buildTooltip(params as { name: string }, metric, meta, districtByName),
      },
      geo: {
        map: "chongqing",
        roam: true,
        zoom: 1.1,
        center: CHONGQING_CENTER,
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
          color: MAP_COLORS,
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
          center: CHONGQING_CENTER,
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

    chart.setOption(option);
    if (selectedDistrict) {
      chart.dispatchAction({ type: "select", name: selectedDistrict });
    }
  }, [
    activeBackend,
    chartData,
    districtByName,
    mapReady,
    metric,
    selectedDistrict,
    selectedMarkerData,
    valueRange.max,
    valueRange.min,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mapReady || activeBackend !== "geojson") return;
    if (selectedDistrict === prevSelectedDistrictRef.current) return;

    const focusCenter = selectedDistrict && districtCenters[selectedDistrict]
      ? districtCenters[selectedDistrict]
      : CHONGQING_CENTER;
    const focusZoom = selectedDistrict ? 2.8 : 1.1;

    chart.setOption({
      geo: {
        center: focusCenter,
        zoom: focusZoom,
        animationDurationUpdate: MAP_VIEW_ANIM_MS,
        animationEasingUpdate: "cubicOut",
      },
      series: [
        {
          center: focusCenter,
          zoom: focusZoom,
          animationDurationUpdate: MAP_VIEW_ANIM_MS,
          animationEasingUpdate: "cubicOut",
        },
        {
          animationDurationUpdate: MAP_VIEW_ANIM_MS,
          animationEasingUpdate: "cubicOut",
        },
      ],
    });

    if (selectedDistrict) {
      chart.dispatchAction({ type: "select", name: selectedDistrict });
    } else if (prevSelectedDistrictRef.current) {
      chart.dispatchAction({ type: "unselect", name: prevSelectedDistrictRef.current });
    }

    prevSelectedDistrictRef.current = selectedDistrict ?? null;
  }, [activeBackend, districtCenters, mapReady, selectedDistrict]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mapReady || activeBackend !== "geojson") return;

    chart.off("click");
    chart.on("click", params => {
      const district = districtByName.get(params.name);
      onSelectDistrict?.(district ?? null);
    });
  }, [activeBackend, districtByName, mapReady, onSelectDistrict]);

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
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl"
          style={{ background: "rgba(248,250,252,0.88)", backdropFilter: "blur(2px)" }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "2.5px solid #BFDBFE",
              borderTopColor: "#3B82F6",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ color: "#6B7280", fontSize: 13, marginTop: 10 }}>
            正在加载地图...
          </span>
        </div>
      )}

      {activeBackend === "amap" && mapReady && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg px-3 py-2"
          style={{
            background: "rgba(255,255,255,0.94)",
            border: "1px solid #E5EAF2",
            boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
          }}
        >
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>
            {meta.label} · {meta.minLabel} / {meta.maxLabel}
          </div>
          <div
            style={{
              width: 132,
              height: 10,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${MAP_COLORS.join(",")})`,
            }}
          />
          <div className="mt-1 flex items-center justify-between" style={{ fontSize: 10, color: "#64748B" }}>
            <span>{formatMetric(valueRange.min, metric)}</span>
            <span>{formatMetric(valueRange.max, metric)} {meta.unit}</span>
          </div>
        </div>
      )}

      <div ref={containerRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />

      <div
        className="flex items-center justify-between"
        style={{ fontSize: 11, color: "#9CA3AF", paddingTop: 6, paddingLeft: 2 }}
      >
        <div className="flex items-center gap-3">
          <span>{meta.desc}</span>
          <span style={{ color: "#64748B" }}>{activeBackend === "amap" ? "高德底图" : "本地 GeoJSON"}</span>
        </div>
        <span style={{ color: "#6B7280" }}>滚轮缩放 · 拖动平移</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: 0.78; } }`}</style>
    </div>
  );
}
