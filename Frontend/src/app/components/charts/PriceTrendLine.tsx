import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { TREND_DATA } from "../../mock/trend";

export function PriceTrendLine() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={TREND_DATA} margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#163A70" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#163A70" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis domain={[12000, 15000]} tickFormatter={v => `${(v/1000).toFixed(1)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={40} />
        <Tooltip formatter={(v: number) => [`${v.toLocaleString()} 元/㎡`, "均价"]} contentStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="avgPrice" stroke="#163A70" strokeWidth={2} fill="url(#priceGrad)" dot={{ r: 3, fill: "#163A70" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
