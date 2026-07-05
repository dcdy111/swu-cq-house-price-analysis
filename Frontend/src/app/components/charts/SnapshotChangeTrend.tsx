import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SnapshotInsightSeriesItem } from "../../services/api";

interface SnapshotChangeTrendProps {
  data?: SnapshotInsightSeriesItem[];
}

export function SnapshotChangeTrend({ data = [] }: SnapshotChangeTrendProps) {
  if (data.length === 0) {
    return <div className="flex h-[220px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无真实调价趋势数据</div>;
  }

  const chartData = data.map(item => ({
    date: item.date,
    label: item.date.slice(5),
    eventCount: Number(item.event_count || 0),
    priceUpCount: Number(item.price_up_count || 0),
    priceDownCount: Number(item.price_down_count || 0),
    avgChangeRate: item.avg_change_rate ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ left: 8, right: 12, top: 12, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF2" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickMargin={8} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={38} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} />
        <Tooltip
          labelFormatter={(_, payload) => String(payload?.[0]?.payload?.date ?? "")}
          formatter={(value: number, name: string, item: any) => {
            if (name === "平均调价幅度") {
              return [`${Number(value || 0).toFixed(2)}%`, name];
            }
            const avgChangeRate = item?.payload?.avgChangeRate;
            const suffix = avgChangeRate === null || avgChangeRate === undefined
              ? ""
              : ` · 平均调价幅度 ${Number(avgChangeRate).toFixed(2)}%`;
            return [`${Number(value || 0).toLocaleString()} 次${suffix}`, name];
          }}
          contentStyle={{ fontSize: 12 }}
        />
        <Line
          name="调价事件"
          type="monotone"
          dataKey="eventCount"
          stroke="#163A70"
          strokeWidth={2.4}
          dot={{ r: 3, fill: "#163A70", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#163A70", stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          name="上调事件"
          type="monotone"
          dataKey="priceUpCount"
          stroke="#16A34A"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#16A34A", strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Line
          name="下调事件"
          type="monotone"
          dataKey="priceDownCount"
          stroke="#E67E22"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#E67E22", strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
