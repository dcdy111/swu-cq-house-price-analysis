import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { PriceDistributionItem } from "../../services/api";

const FALLBACK_DATA: PriceDistributionItem[] = [
  { label: "50万以下", count: 4210, ratio: 7.2 },
  { label: "50-100万", count: 13860, ratio: 23.8 },
  { label: "100-150万", count: 17420, ratio: 29.9 },
  { label: "150-200万", count: 10480, ratio: 18.0 },
  { label: "200-300万", count: 7610, ratio: 13.1 },
  { label: "300-500万", count: 3220, ratio: 5.5 },
  { label: "500万以上", count: 1460, ratio: 2.5 },
];

interface PriceDistributionBarProps {
  data?: PriceDistributionItem[];
}

export function PriceDistributionBar({ data: apiData }: PriceDistributionBarProps) {
  const data = apiData && apiData.length > 0 ? apiData : FALLBACK_DATA;

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
