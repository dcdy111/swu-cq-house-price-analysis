import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { LAYOUT_DIST } from "../../mock/trend";

const COLORS = ["#163A70", "#1F4E8C", "#4F7DBD", "#E67E22", "#F59E0B", "#9CA3AF"];

export function LayoutDonut() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={LAYOUT_DIST} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
          {LAYOUT_DIST.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => [`${v}%`, "占比"]} contentStyle={{ fontSize: 12 }} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
