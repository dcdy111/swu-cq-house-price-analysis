import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DistrictPriceItem } from "../../services/api";

interface DistrictRankBarProps {
  data?: DistrictPriceItem[];
}

export function DistrictRankBar({ data: apiData }: DistrictRankBarProps) {
  const data = apiData && apiData.length > 0
    ? apiData.slice(0, 8).map(d => ({ name: d.district.replace("区", ""), value: Math.round(d.avg_unit_price) }))
    : [];
  const maxValue = Math.max(10000, ...data.map(item => item.value));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5EAF2" />
        <XAxis type="number" domain={[0, Math.ceil(maxValue / 5000) * 5000]} tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis dataKey="name" type="category" width={48} tick={{ fontSize: 12, fill: "#6B7280" }} />
        <Tooltip formatter={(v: number) => [`${v.toLocaleString()} 元/㎡`, "均价"]} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((_, i) => (
            <Cell key={`cell-${i}`} fill={i === 0 ? "#E67E22" : i < 3 ? "#1F4E8C" : "#4F7DBD"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
