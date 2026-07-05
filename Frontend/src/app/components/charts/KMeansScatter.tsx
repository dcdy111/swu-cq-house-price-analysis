import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CLUSTER_COLORS = ["#4F7DBD", "#163A70", "#E67E22", "#16A34A"];
const CLUSTER_LABELS = ["主流挂牌层", "均衡层", "改善层", "高价值层"];

interface KMeansPoint {
  x: number;
  y: number;
  cluster: number;
  label?: string;
}

export function KMeansScatter({ data = [] }: { data?: KMeansPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-[300px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无价值分层散点数据</div>;
  }

  const clusterIds = Array.from(new Set(data.map(item => item.cluster))).sort((a, b) => a - b);
  const clusters = clusterIds.map(c => ({
    name: data.find(item => item.cluster === c)?.label ?? CLUSTER_LABELS[c] ?? `分层${c + 1}`,
    data: data.filter(d => d.cluster === c),
    color: CLUSTER_COLORS[c],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ left: 12, right: 16, top: 28, bottom: 18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="x" name="单价" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} label={{ value: "单价(元/㎡)", position: "bottom", fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis dataKey="y" name="面积" unit="㎡" tick={{ fontSize: 11, fill: "#9CA3AF" }} width={38} />
        <Tooltip formatter={(v: number, name: string) => name === "单价" ? [`${v.toFixed(0)}元/㎡`, name] : [`${v.toFixed(0)}㎡`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
        {clusters.map(({ name, data, color }, i) => (
          <Scatter key={`cluster-${i}`} name={name} data={data} fill={color ?? CLUSTER_COLORS[i % CLUSTER_COLORS.length]} opacity={0.75} r={4} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
