export interface District {
  name: string;
  avgPrice: number;
  count: number;
  change: number; // yoy %
  quality: number;
}

export const DISTRICTS: District[] = [
  { name: "渝中区", avgPrice: 22450, count: 8234, change: 3.2, quality: 98.2 },
  { name: "江北区", avgPrice: 18320, count: 12456, change: 1.8, quality: 96.4 },
  { name: "南岸区", avgPrice: 16780, count: 10982, change: 2.5, quality: 95.8 },
  { name: "渝北区", avgPrice: 15640, count: 18932, change: -0.5, quality: 97.1 },
  { name: "九龙坡区", avgPrice: 13560, count: 11234, change: 0.9, quality: 94.7 },
  { name: "沙坪坝区", avgPrice: 12890, count: 9654, change: 1.2, quality: 94.2 },
  { name: "大渡口区", avgPrice: 11230, count: 5432, change: -1.1, quality: 92.8 },
  { name: "巴南区", avgPrice: 10450, count: 7823, change: 2.8, quality: 93.9 },
  { name: "北碚区", avgPrice: 9870, count: 4321, change: 0.3, quality: 91.6 },
  { name: "璧山区", avgPrice: 8960, count: 6543, change: 3.7, quality: 92.1 },
  { name: "江津区", avgPrice: 8420, count: 6120, change: 1.9, quality: 90.5 },
  { name: "永川区", avgPrice: 8230, count: 5678, change: 1.5, quality: 90.9 },
  { name: "合川区", avgPrice: 7890, count: 4897, change: 0.8, quality: 89.7 },
  { name: "长寿区", avgPrice: 7680, count: 3950, change: 1.1, quality: 88.6 },
  { name: "铜梁区", avgPrice: 7340, count: 3245, change: 2.1, quality: 89.1 },
  { name: "荣昌区", avgPrice: 6980, count: 2876, change: 1.9, quality: 87.8 },
  { name: "大足区", avgPrice: 6820, count: 3088, change: 1.4, quality: 87.2 },
  { name: "涪陵区", avgPrice: 6680, count: 4485, change: 1.2, quality: 88.4 },
  { name: "綦江区", avgPrice: 6420, count: 2970, change: 0.6, quality: 86.5 },
  { name: "南川区", avgPrice: 6250, count: 2460, change: 0.9, quality: 86.1 },
  { name: "万州区", avgPrice: 6120, count: 5038, change: 1.0, quality: 88.0 },
  { name: "潼南区", avgPrice: 5960, count: 2312, change: 1.6, quality: 85.7 },
  { name: "梁平区", avgPrice: 5830, count: 2190, change: 0.4, quality: 85.2 },
  { name: "开州区", avgPrice: 5710, count: 2615, change: 0.7, quality: 86.0 },
  { name: "黔江区", avgPrice: 5590, count: 1820, change: 0.5, quality: 84.8 },
  { name: "武隆区", avgPrice: 5480, count: 1410, change: 1.8, quality: 83.9 },
  { name: "垫江县", avgPrice: 5360, count: 1635, change: 0.8, quality: 84.2 },
  { name: "丰都县", avgPrice: 5230, count: 1492, change: 0.6, quality: 83.7 },
  { name: "忠县", avgPrice: 5160, count: 1330, change: 0.2, quality: 83.3 },
  { name: "云阳县", avgPrice: 5080, count: 1570, change: 0.9, quality: 84.0 },
  { name: "奉节县", avgPrice: 4980, count: 1264, change: 0.4, quality: 82.9 },
  { name: "巫山县", avgPrice: 4860, count: 990, change: 0.7, quality: 82.1 },
  { name: "巫溪县", avgPrice: 4720, count: 820, change: 0.3, quality: 81.8 },
  { name: "城口县", avgPrice: 4580, count: 640, change: 0.1, quality: 80.6 },
  { name: "石柱土家族自治县", avgPrice: 4460, count: 870, change: 0.5, quality: 81.5 },
  { name: "秀山土家族苗族自治县", avgPrice: 4390, count: 760, change: 0.8, quality: 80.9 },
  { name: "酉阳土家族苗族自治县", avgPrice: 4310, count: 690, change: 0.4, quality: 80.2 },
  { name: "彭水苗族土家族自治县", avgPrice: 4240, count: 710, change: 0.6, quality: 80.5 },
];

export const TOP_DISTRICTS = [...DISTRICTS]
  .sort((a, b) => b.avgPrice - a.avgPrice)
  .slice(0, 10);
