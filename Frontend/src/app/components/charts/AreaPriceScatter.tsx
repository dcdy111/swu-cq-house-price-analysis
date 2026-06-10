import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { SCATTER_DATA } from "../../mock/trend";

const DISTRICT_COLORS: Record<string, string> = {
  "渝中区": "#E67E22",
  "江北区": "#163A70",
  "南岸区": "#1F4E8C",
  "渝北区": "#4F7DBD",
  "九龙坡区": "#F59E0B",
};

export function AreaPriceScatter() {
  const byDistrict = ["渝中区", "江北区", "南岸区", "渝北区", "九龙坡区"].map(d => ({
    name: d,
    data: SCATTER_DATA.filter(p => p.district === d).slice(0, 20),
    color: DISTRICT_COLORS[d],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="size" name="面积" unit="㎡" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
        <YAxis dataKey="price" name="单价" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={35} />
        <ZAxis range={[20, 40]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, name) => name === "面积" ? [`${v}㎡`, name] : [`${Number(v).toLocaleString()}元/㎡`, name]} contentStyle={{ fontSize: 12 }} />
        {byDistrict.map(({ name, data, color }, i) => (
          <Scatter key={`scatter-${i}`} name={name} data={data} fill={color} opacity={0.7} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
