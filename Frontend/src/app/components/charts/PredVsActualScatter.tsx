import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { PRED_VS_ACTUAL } from "../../mock/model";

export function PredVsActualScatter() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ left: 5, right: 10, top: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="actual" name="实际" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} label={{ value: "实际单价", position: "bottom", fontSize: 12, fill: "#9CA3AF" }} />
        <YAxis dataKey="predicted" name="预测" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={38} label={{ value: "预测", angle: -90, position: "insideLeft", fontSize: 12, fill: "#9CA3AF" }} />
        <Tooltip formatter={(v: number) => [`${v.toLocaleString()}元/㎡`]} contentStyle={{ fontSize: 12 }} />
        <ReferenceLine segment={[{ x: 5000, y: 5000 }, { x: 30000, y: 30000 }]} stroke="#E67E22" strokeDasharray="4 2" strokeWidth={1.5} />
        <Scatter data={PRED_VS_ACTUAL} fill="#163A70" opacity={0.6} r={3} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
