export interface TrendPoint {
  month: string;
  avgPrice: number;
  volume: number;
  newListings: number;
}

export const TREND_DATA: TrendPoint[] = [
  { month: "25-07", avgPrice: 13120, volume: 3421, newListings: 4213 },
  { month: "25-08", avgPrice: 13280, volume: 3654, newListings: 4567 },
  { month: "25-09", avgPrice: 13540, volume: 3234, newListings: 3987 },
  { month: "25-10", avgPrice: 13450, volume: 2987, newListings: 3654 },
  { month: "25-11", avgPrice: 13320, volume: 2756, newListings: 3421 },
  { month: "25-12", avgPrice: 13180, volume: 2543, newListings: 3234 },
  { month: "26-01", avgPrice: 12980, volume: 2123, newListings: 2876 },
  { month: "26-02", avgPrice: 13240, volume: 2456, newListings: 3123 },
  { month: "26-03", avgPrice: 13680, volume: 3789, newListings: 4876 },
  { month: "26-04", avgPrice: 13820, volume: 4123, newListings: 5234 },
  { month: "26-05", avgPrice: 13950, volume: 4567, newListings: 5678 },
  { month: "26-06", avgPrice: 14120, volume: 4234, newListings: 5123 },
];

export const SCATTER_DATA = Array.from({ length: 120 }, (_, i) => ({
  size: 50 + Math.random() * 250,
  price: 6000 + Math.random() * 20000,
  district: ["渝中区","江北区","南岸区","渝北区","九龙坡区"][Math.floor(Math.random()*5)],
}));

export const LAYOUT_DIST = [
  { name: "3室2厅", value: 35 },
  { name: "2室2厅", value: 28 },
  { name: "3室1厅", value: 15 },
  { name: "2室1厅", value: 12 },
  { name: "4室2厅", value: 6 },
  { name: "1室1厅", value: 4 },
];
