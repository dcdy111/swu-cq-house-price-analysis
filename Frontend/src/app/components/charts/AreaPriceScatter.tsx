import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { AreaPricePoint } from "../../services/api";

const COLORS = ["#E67E22", "#163A70", "#1F4E8C", "#4F7DBD", "#F59E0B", "#16A34A", "#7C3AED", "#9CA3AF"];

interface AreaPriceScatterProps {
  data?: AreaPricePoint[];
}

function displayDistrictName(value?: string | null) {
  const text = String(value || "").trim();
  const aliases: Record<string, string> = {
    yubei: "渝北区",
    yuzhong: "渝中区",
    jiangbei: "江北区",
    nanan: "南岸区",
    nanana: "南岸区",
    "nan'an": "南岸区",
    jiulongpo: "九龙坡区",
    shapingba: "沙坪坝区",
    dadukou: "大渡口区",
    banan: "巴南区",
    beibei: "北碚区",
    dianjiangxian: "垫江县",
    dainjiangxian: "垫江县",
    wansheng: "万盛",
  };
  const normalized = aliases[text.toLowerCase()] || text || "待复核";
  return normalized === "万盛经开区" ? "万盛" : normalized;
}

function paddedDomain(values: number[], ratio = 0.08): [number, number] | ["auto", "auto"] {
  const valid = values.filter(value => Number.isFinite(value));
  if (!valid.length) return ["auto", "auto"];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = Math.max(max - min, max * 0.1, 1);
  return [Math.max(0, Math.floor(min - span * ratio)), Math.ceil(max + span * ratio)];
}

export function AreaPriceScatter({ data: apiData }: AreaPriceScatterProps) {
  const points = apiData && apiData.length > 0
    ? apiData.map(item => ({
      size: item.area,
      price: item.unit_price,
      district: displayDistrictName(item.district),
      title: item.title,
      totalPrice: item.total_price,
    }))
    : [];
  if (points.length === 0) {
    return <div className="flex h-[260px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无面积与挂牌单价数据</div>;
  }
  const xDomain = paddedDomain(points.map(item => item.size), 0.06);
  const yDomain = paddedDomain(points.map(item => item.price), 0.08);
  const districts = Array.from(new Set(points.map(item => item.district))).slice(0, 8);
  const byDistrict = districts.map((district, index) => ({
    name: district,
    data: points.filter(p => p.district === district).slice(0, 80),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ left: 2, right: 18, top: 8, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis
          dataKey="size"
          domain={xDomain}
          name="面积"
          type="number"
          unit="㎡"
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickMargin={6}
        />
        <YAxis
          dataKey="price"
          domain={yDomain}
          name="单价"
          type="number"
          tickFormatter={v => `${(v/1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          width={42}
        />
        <ZAxis range={[20, 40]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, name) => name === "面积" ? [`${v}㎡`, name] : [`${Number(v).toLocaleString()}元/㎡`, name]} contentStyle={{ fontSize: 12 }} />
        {byDistrict.map(({ name, data, color }, i) => (
          <Scatter key={`scatter-${i}`} name={name} data={data} fill={color} opacity={0.7} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
