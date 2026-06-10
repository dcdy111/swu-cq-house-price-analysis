import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { KMEANS_DATA } from "../../mock/model";

const CLUSTER_COLORS = ["#4F7DBD", "#163A70", "#E67E22", "#16A34A"];
const CLUSTER_LABELS = ["经济型", "中端", "中高端", "豪华型"];

export function KMeansScatter() {
  const clusters = [0, 1, 2, 3].map(c => ({
    name: CLUSTER_LABELS[c],
    data: KMEANS_DATA.filter(d => d.cluster === c),
    color: CLUSTER_COLORS[c],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="x" name="单价" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} label={{ value: "单价(元/㎡)", position: "bottom", fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis dataKey="y" name="面积" unit="㎡" tick={{ fontSize: 11, fill: "#9CA3AF" }} width={38} />
        <Tooltip formatter={(v: number, name: string) => name === "单价" ? [`${v.toFixed(0)}元/㎡`, name] : [`${v.toFixed(0)}㎡`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {clusters.map(({ name, data, color }, i) => (
          <Scatter key={`cluster-${i}`} name={name} data={data} fill={color} opacity={0.75} r={4} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
