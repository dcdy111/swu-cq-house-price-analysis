import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { PriceDistributionItem } from "../../services/api";

interface PriceDistributionBarProps {
  data?: PriceDistributionItem[];
}

export function PriceDistributionBar({ data: apiData }: PriceDistributionBarProps) {
  const data = apiData && apiData.length > 0 ? apiData : [];
  const chartHeight = Math.max(240, data.length * 34);

  if (data.length === 0) {
    return <div className="h-[200px] flex items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无数据</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5EAF2" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickFormatter={value => Number(value).toLocaleString()}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          interval={0}
          tick={{ fontSize: 11, fill: "#6B7280" }}
        />
        <Tooltip
          formatter={(v: number, name: string, item: any) => [
            `${Number(v).toLocaleString()} 套，占比 ${item.payload.ratio}%`,
            "样本量",
          ]}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={index === 2 ? "#E67E22" : "#4F7DBD"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
