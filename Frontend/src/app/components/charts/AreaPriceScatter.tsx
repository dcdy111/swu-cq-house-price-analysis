import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { AreaPricePoint } from "../../services/api";

const COLORS = ["#E67E22", "#163A70", "#1F4E8C", "#4F7DBD", "#F59E0B", "#16A34A", "#7C3AED", "#9CA3AF"];

interface AreaPriceScatterProps {
  data?: AreaPricePoint[];
}

export function AreaPriceScatter({ data: apiData }: AreaPriceScatterProps) {
  const points = apiData && apiData.length > 0
    ? apiData.map(item => ({
      size: item.area,
      price: item.unit_price,
      district: item.district,
      title: item.title,
      totalPrice: item.total_price,
    }))
    : [];
  const districts = Array.from(new Set(points.map(item => item.district))).slice(0, 8);
  const byDistrict = districts.map((district, index) => ({
    name: district,
    data: points.filter(p => p.district === district).slice(0, 80),
    color: COLORS[index % COLORS.length],
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
