import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { PriceTrendItem } from "../../services/api";

interface PriceTrendLineProps {
  data?: PriceTrendItem[];
}

export function PriceTrendLine({ data: apiData }: PriceTrendLineProps) {
  const formatLabel = (value: string) => {
    if (!value) return value;
    if (value.length === 16) return `${value.slice(5, 10)} ${value.slice(11, 13)}`;
    if (value.length === 10) return value.slice(5);
    if (value.length === 7) return value.slice(2);
    return value;
  };
  const data = apiData && apiData.length > 0
    ? apiData.map(item => ({
      month: formatLabel(item.month),
      rawLabel: item.month,
      avgPrice: Math.round(item.avg_unit_price),
      volume: item.listing_count,
      granularity: item.granularity,
    }))
    : [];

  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无数据</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#163A70" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#163A70" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis domain={["auto", "auto"]} tickFormatter={v => `${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={40} />
        <Tooltip
          labelFormatter={(_, payload) => String(payload?.[0]?.payload?.rawLabel ?? "")}
          formatter={(v: number, _name, item: any) => [
            `${v.toLocaleString()} 元/㎡ · ${Number(item?.payload?.volume ?? 0).toLocaleString()} 条`,
            item?.payload?.granularity === "hour"
              ? "小时均价"
              : item?.payload?.granularity === "day"
                ? "日均价"
                : "月均价",
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <Area type="monotone" dataKey="avgPrice" stroke="#163A70" strokeWidth={2} fill="url(#priceGrad)" dot={{ r: 3, fill: "#163A70" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
