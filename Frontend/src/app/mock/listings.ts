export interface Listing {
  id: string;
  title: string;
  district: string;
  area: string;
  totalPrice: number;
  unitPrice: number;
  size: number;
  layout: string;
  floor: string;
  buildYear: number;
  source: string;
  status: "active" | "sold" | "pending";
  tags: string[];
  address: string;
  agent: string;
  crawledAt: string;
}

export const LISTINGS: Listing[] = [
  { id: "L001", title: "融创凡尔赛宫 4室2厅", district: "渝北区", area: "金渝大道商圈", totalPrice: 368, unitPrice: 14720, size: 250, layout: "4室2厅", floor: "12/32层", buildYear: 2019, source: "链家", status: "active", tags: ["精装修", "江景", "地铁2站"], address: "渝北区金渝大道88号", agent: "张明华", crawledAt: "2026-06-09 08:30" },
  { id: "L002", title: "龙湖源著 3室2厅", district: "南岸区", area: "南坪商圈", totalPrice: 218, unitPrice: 12353, size: 176, layout: "3室2厅", floor: "8/24层", buildYear: 2021, source: "贝壳", status: "active", tags: ["学区房", "精装修", "配套完善"], address: "南岸区南坪镇南坪路136号", agent: "李婷", crawledAt: "2026-06-09 09:15" },
  { id: "L003", title: "金科十年城 2室2厅", district: "江北区", area: "观音桥商圈", totalPrice: 135, unitPrice: 10000, size: 135, layout: "2室2厅", floor: "18/33层", buildYear: 2017, source: "安居客", status: "active", tags: ["地铁口", "商圈中心"], address: "江北区建新北路2号", agent: "王强", crawledAt: "2026-06-09 10:00" },
  { id: "L004", title: "保利天汇 3室1厅", district: "九龙坡区", area: "石桥铺商圈", totalPrice: 178, unitPrice: 11125, size: 160, layout: "3室1厅", floor: "6/18层", buildYear: 2016, source: "链家", status: "sold", tags: ["带车位", "电梯房"], address: "九龙坡区石桥铺西路88号", agent: "赵雪", crawledAt: "2026-06-08 14:20" },
  { id: "L005", title: "万科翡翠滨江 4室2厅", district: "渝中区", area: "解放碑商圈", totalPrice: 580, unitPrice: 24167, size: 240, layout: "4室2厅", floor: "28/42层", buildYear: 2022, source: "贝壳", status: "active", tags: ["江景房", "豪装", "地标楼盘"], address: "渝中区滨江路99号", agent: "刘洋", crawledAt: "2026-06-09 11:30" },
  { id: "L006", title: "中海云麓 2室1厅", district: "沙坪坝区", area: "沙坪坝商圈", totalPrice: 98, unitPrice: 8909, size: 110, layout: "2室1厅", floor: "4/12层", buildYear: 2014, source: "安居客", status: "active", tags: ["学区房", "毛坯"], address: "沙坪坝区沙坪坝正街30号", agent: "陈晨", crawledAt: "2026-06-09 07:45" },
  { id: "L007", title: "华润置地悦府 3室2厅", district: "大渡口区", area: "大渡口商圈", totalPrice: 155, unitPrice: 10333, size: 150, layout: "3室2厅", floor: "15/28层", buildYear: 2020, source: "链家", status: "pending", tags: ["品质小区", "精装交付"], address: "大渡口区春晖路188号", agent: "周杰", crawledAt: "2026-06-08 16:00" },
  { id: "L008", title: "碧桂园珑璟 1室1厅", district: "北碚区", area: "北碚商圈", totalPrice: 52, unitPrice: 7429, size: 70, layout: "1室1厅", floor: "3/6层", buildYear: 2013, source: "安居客", status: "active", tags: ["低楼层", "实惠"], address: "北碚区天生路1号", agent: "吴丽", crawledAt: "2026-06-09 13:00" },
  { id: "L009", title: "恒大翡翠华庭 3室2厅", district: "巴南区", area: "巴南商圈", totalPrice: 128, unitPrice: 9143, size: 140, layout: "3室2厅", floor: "11/22层", buildYear: 2018, source: "贝壳", status: "active", tags: ["地铁3号线", "精装修"], address: "巴南区龙洲湾街道兴龙大道88号", agent: "孙磊", crawledAt: "2026-06-09 12:30" },
  { id: "L010", title: "绿地东港国际 2室2厅", district: "两江新区", area: "礼嘉商圈", totalPrice: 188, unitPrice: 13286, size: 141, layout: "2室2厅", floor: "22/40层", buildYear: 2023, source: "链家", status: "active", tags: ["新房次新", "高楼层", "江景"], address: "两江新区礼嘉滨江路66号", agent: "马超", crawledAt: "2026-06-09 08:00" },
];

export const LAYOUT_OPTIONS = ["全部户型", "1室1厅", "2室1厅", "2室2厅", "3室1厅", "3室2厅", "4室2厅"];
export const DISTRICT_OPTIONS = [
  "全部区县", "渝中区", "大渡口区", "江北区", "沙坪坝区", "九龙坡区", "南岸区", "北碚区",
  "渝北区", "巴南区", "万州区", "涪陵区", "黔江区", "长寿区", "江津区", "合川区",
  "永川区", "南川区", "綦江区", "大足区", "璧山区", "铜梁区", "潼南区", "荣昌区",
  "开州区", "梁平区", "武隆区", "城口县", "丰都县", "垫江县", "忠县", "云阳县",
  "奉节县", "巫山县", "巫溪县", "石柱土家族自治县", "秀山土家族苗族自治县",
  "酉阳土家族苗族自治县", "彭水苗族土家族自治县",
];
