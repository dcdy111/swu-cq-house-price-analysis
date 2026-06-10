export const MODEL_METRICS = {
  mae: 1287.56,
  rmse: 1842.33,
  r2: 0.8421,
  mape: 9.34,
  trainSize: 103000,
  testSize: 25645,
  trainTime: "4m 23s",
  modelType: "XGBoost",
  version: "v2.3.1",
  lastTrained: "2026-06-09 04:00",
};

export const FEATURE_IMPORTANCE = [
  { feature: "区域均价", importance: 0.312 },
  { feature: "建筑面积", importance: 0.228 },
  { feature: "楼层位置", importance: 0.145 },
  { feature: "建筑年代", importance: 0.098 },
  { feature: "地铁距离", importance: 0.076 },
  { feature: "装修情况", importance: 0.054 },
  { feature: "户型结构", importance: 0.038 },
  { feature: "商圈热度", importance: 0.026 },
  { feature: "朝向", importance: 0.015 },
  { feature: "容积率", importance: 0.008 },
];

export const PRED_VS_ACTUAL = Array.from({ length: 80 }, () => {
  const actual = 5000 + Math.random() * 25000;
  const noise = (Math.random() - 0.5) * 4000;
  return { actual: Math.round(actual), predicted: Math.round(actual + noise) };
});

export const KMEANS_DATA = Array.from({ length: 120 }, (_, i) => {
  const cluster = i % 4;
  const centers = [[8000, 80], [14000, 140], [20000, 200], [28000, 260]];
  const [cx, cy] = centers[cluster];
  return {
    x: cx + (Math.random() - 0.5) * 3000,
    y: cy + (Math.random() - 0.5) * 40,
    cluster,
    label: ["经济型", "中端", "中高端", "豪华型"][cluster],
  };
});

export const ANOMALIES = [
  { id: "A001", listing: "渝中区某江景房", actualPrice: 38500, predictedPrice: 22100, deviation: 74.2, reason: "豪华装修+稀缺江景", severity: "high" },
  { id: "A002", listing: "渝北区某低楼层房", actualPrice: 6200, predictedPrice: 13800, deviation: -55.1, reason: "底层噪音+采光差", severity: "high" },
  { id: "A003", listing: "南岸区老旧小区", actualPrice: 8900, predictedPrice: 12400, deviation: -28.2, reason: "房龄超30年", severity: "medium" },
  { id: "A004", listing: "江北区商住混用", actualPrice: 17600, predictedPrice: 13200, deviation: 33.3, reason: "地标商圈溢价", severity: "medium" },
];

export const BOX_DATA = [
  { district: "渝中", q1: 19000, median: 22000, q3: 26000, min: 14000, max: 38000 },
  { district: "江北", q1: 15000, median: 18000, q3: 22000, min: 10000, max: 32000 },
  { district: "南岸", q1: 13000, median: 16500, q3: 20000, min: 8500, max: 28000 },
  { district: "渝北", q1: 12000, median: 15500, q3: 19000, min: 7800, max: 26000 },
  { district: "九龙坡", q1: 11000, median: 13500, q3: 16500, min: 7000, max: 22000 },
  { district: "沙坪坝", q1: 10500, median: 12800, q3: 15500, min: 6500, max: 20000 },
];

export const COMPARE_MODELS = [
  { model: "XGBoost", mae: 1287, rmse: 1842, r2: 0.842, mape: 9.34 },
  { model: "随机森林", mae: 1456, rmse: 2043, r2: 0.821, mape: 10.82 },
  { model: "岭回归", mae: 2134, rmse: 2876, r2: 0.754, mape: 15.67 },
  { model: "GBDT", mae: 1312, rmse: 1876, r2: 0.839, mape: 9.61 },
];
