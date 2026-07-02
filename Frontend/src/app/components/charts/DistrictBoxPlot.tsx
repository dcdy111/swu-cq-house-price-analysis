import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DistrictBoxItem {
  district: string;
  q1: number;
  median: number;
  q3: number;
  min: number;
  max: number;
}

function displayDistrict(value: string) {
  const text = String(value || "").trim();
  const aliases: Record<string, string> = {
    yubei: "渝北",
    yuzhong: "渝中",
    jiangbei: "江北",
    shapingba: "沙坪坝",
    jiulongpo: "九龙坡",
    nanan: "南岸",
    nanana: "南岸",
    banan: "巴南",
    beibei: "北碚",
    dadukou: "大渡口",
  };
  return (aliases[text.toLowerCase()] ?? text)
    .replace("土家族苗族自治县", "")
    .replace("苗族土家族自治县", "")
    .replace("土家族自治县", "")
    .replace(/区$|县$/g, "");
}

// Simulate a box plot using overlapping bars
export function DistrictBoxPlot({ source = [] }: { source?: DistrictBoxItem[] }) {
  const data = source.map(d => ({
    name: displayDistrict(d.district),
    district: d.district,
    min: d.min,
    q1: d.q1 - d.min,
    iqr: d.q3 - d.q1,
    q3top: d.max - d.q3,
    median: d.median,
  }));

  if (data.length === 0) {
    return <div className="flex h-[220px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无 EDA 分布数据</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 5, right: 10, top: 5, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="name" interval={0} angle={-42} textAnchor="end" height={64} tick={{ fontSize: 11, fill: "#6B7280" }} />
        <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={38} />
        <Tooltip
          labelFormatter={(_label, payload) => payload?.[0]?.payload?.district ?? ""}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = { min: "最小值", q1: "Q1-最小", iqr: "四分位距", q3top: "最大-Q3" };
            return [`${v.toLocaleString()}`, labels[name] ?? name];
          }}
          contentStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="min" stackId="box" fill="transparent" />
        <Bar dataKey="q1" stackId="box" fill="#4F7DBD" opacity={0.3} barSize={28} />
        <Bar dataKey="iqr" stackId="box" fill="#163A70" opacity={0.7} barSize={28} radius={[2, 2, 0, 0]} />
        <Bar dataKey="q3top" stackId="box" fill="#4F7DBD" opacity={0.3} barSize={28} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
