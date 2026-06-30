import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { PriceDistributionItem } from "../../services/api";

interface PriceDistributionBarProps {
  data?: PriceDistributionItem[];
}

export function PriceDistributionBar({ data: apiData }: PriceDistributionBarProps) {
  const data = apiData && apiData.length > 0 ? apiData : [];

  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无数据</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EAF2" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B7280" }} interval={0} angle={-18} textAnchor="end" height={46} />
        <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={v => `${Number(v).toLocaleString()}`} width={45} />
        <Tooltip
          formatter={(v: number, name: string, item: any) => [
            `${Number(v).toLocaleString()} 套，占比 ${item.payload.ratio}%`,
            "样本量",
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={20}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={index === 2 ? "#E67E22" : "#4F7DBD"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
