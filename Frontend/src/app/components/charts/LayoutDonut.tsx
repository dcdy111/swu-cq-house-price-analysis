import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { LayoutDistributionItem } from "../../services/api";

const COLORS = ["#163A70", "#1F4E8C", "#4F7DBD", "#E67E22", "#F59E0B", "#9CA3AF"];

interface LayoutDonutProps {
  data?: LayoutDistributionItem[];
}

export function LayoutDonut({ data: apiData }: LayoutDonutProps) {
  const data = apiData && apiData.length > 0 ? apiData : [];

  if (data.length === 0) {
    return <div className="flex h-[240px] items-center justify-center" style={{ fontSize: 12, color: "#9CA3AF" }}>暂无数据</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={54}
            outerRadius={82}
            paddingAngle={1}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(value: number, _name, item: any) => [
              `${value}% · ${Number(item?.payload?.count ?? 0).toLocaleString()} 套`,
              item?.payload?.name ?? "户型",
            ]}
            contentStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {data.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span className="truncate" title={item.name} style={{ fontSize: 11, color: "#4B5563" }}>
              {item.name} {item.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
