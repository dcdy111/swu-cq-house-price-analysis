export interface District {
  name: string;
  avgPrice: number;
  count: number;
  change: number; // yoy %
}

export const DISTRICTS: District[] = [
  { name: "渝中区", avgPrice: 22450, count: 8234, change: 3.2 },
  { name: "江北区", avgPrice: 18320, count: 12456, change: 1.8 },
  { name: "南岸区", avgPrice: 16780, count: 10982, change: 2.5 },
  { name: "渝北区", avgPrice: 15640, count: 18932, change: -0.5 },
  { name: "两江新区", avgPrice: 14980, count: 9845, change: 4.1 },
  { name: "九龙坡区", avgPrice: 13560, count: 11234, change: 0.9 },
  { name: "沙坪坝区", avgPrice: 12890, count: 9654, change: 1.2 },
  { name: "大渡口区", avgPrice: 11230, count: 5432, change: -1.1 },
  { name: "巴南区", avgPrice: 10450, count: 7823, change: 2.8 },
  { name: "北碚区", avgPrice: 9870, count: 4321, change: 0.3 },
  { name: "璧山区", avgPrice: 8960, count: 6543, change: 3.7 },
  { name: "永川区", avgPrice: 8230, count: 5678, change: 1.5 },
  { name: "合川区", avgPrice: 7890, count: 4897, change: 0.8 },
  { name: "铜梁区", avgPrice: 7340, count: 3245, change: 2.1 },
  { name: "荣昌区", avgPrice: 6980, count: 2876, change: 1.9 },
];

export const TOP_DISTRICTS = DISTRICTS.slice(0, 10);
