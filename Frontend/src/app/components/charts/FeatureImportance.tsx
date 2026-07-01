import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface FeatureImportanceItem {
  feature: string;
  importance: number;
}

export function FeatureImportance({ data = [] }: { data?: FeatureImportanceItem[] }) {
  if (data.length === 0) {
    return <div className="flex h-[280px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无特征重要性数据</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5EAF2" />
        <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis dataKey="feature" type="category" width={72} tick={{ fontSize: 12, fill: "#6B7280" }} />
        <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "重要性"]} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="importance" radius={[0, 4, 4, 0]} barSize={18}>
          {data.map((_, i) => <Cell key={`cell-${i}`} fill={i === 0 ? "#E67E22" : "#163A70"} opacity={1 - i * 0.06} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
