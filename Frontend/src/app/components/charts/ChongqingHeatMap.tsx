import { useState } from "react";
import { DISTRICTS } from "../../mock/districts";

// Approximate topology of Chongqing's main urban districts as SVG polygons
const DISTRICT_SHAPES: { name: string; d: string }[] = [
  { name: "渝中区", d: "M320 195 L355 185 L370 200 L365 220 L330 225 Z" },
  { name: "江北区", d: "M355 145 L400 135 L420 155 L410 185 L380 195 L355 185 Z" },
  { name: "南岸区", d: "M330 225 L365 220 L390 240 L375 270 L340 265 Z" },
  { name: "渝北区", d: "M360 90 L430 85 L455 115 L440 145 L400 155 L370 145 L355 115 Z" },
  { name: "九龙坡区", d: "M260 210 L320 195 L330 225 L310 260 L270 255 Z" },
  { name: "沙坪坝区", d: "M240 160 L310 155 L325 180 L320 200 L270 215 L245 200 Z" },
  { name: "大渡口区", d: "M230 245 L270 255 L275 285 L240 295 L215 270 Z" },
  { name: "北碚区", d: "M270 90 L340 85 L360 110 L355 135 L320 145 L280 140 L260 115 Z" },
  { name: "巴南区", d: "M310 265 L380 275 L390 310 L350 330 L300 320 L290 295 Z" },
  { name: "两江新区", d: "M400 130 L460 120 L490 145 L480 175 L445 185 L415 180 Z" },
  { name: "璧山区", d: "M175 175 L245 168 L255 200 L245 230 L185 235 L165 205 Z" },
  { name: "永川区", d: "M130 250 L190 245 L205 280 L180 310 L135 305 L115 275 Z" },
  { name: "合川区", d: "M275 55 L345 50 L365 80 L340 95 L290 98 L265 78 Z" },
  { name: "铜梁区", d: "M185 140 L255 135 L265 165 L250 190 L190 192 L170 165 Z" },
];

function priceToColor(price: number): string {
  const min = 6000, max = 24000;
  const t = Math.min(1, Math.max(0, (price - min) / (max - min)));
  // Blue to orange gradient
  const r = Math.round(22 + t * (230 - 22));
  const g = Math.round(58 + t * (126 - 58));
  const b = Math.round(112 + t * (34 - 112));
  return `rgb(${r},${g},${b})`;
}

export function ChongqingHeatMap() {
  const [hovered, setHovered] = useState<string | null>(null);
  const priceMap = Object.fromEntries(DISTRICTS.map(d => [d.name, d.avgPrice]));

  return (
    <div className="relative">
      <svg viewBox="0 0 620 380" width="100%" height={260}>
        {/* Water background */}
        <rect x="0" y="0" width="620" height="380" fill="#DBEAFE" rx="6" />

        {(() => {
          // Improved district shapes — geographically approximate Chongqing layout
          const shapes: { name: string; d: string }[] = [
            { name: "合川区",  d: "M 175 22 L 318 18 L 348 50 L 315 82 L 248 92 L 210 80 L 185 52 Z" },
            { name: "北碚区",  d: "M 130 88 L 210 80 L 248 92 L 262 122 L 252 152 L 215 165 L 178 158 L 142 132 Z" },
            { name: "铜梁区",  d: "M 65 108 L 130 88 L 142 132 L 138 172 L 108 198 L 72 188 L 52 150 L 58 120 Z" },
            { name: "渝北区",  d: "M 248 92 L 318 82 L 435 78 L 482 112 L 472 162 L 442 180 L 400 188 L 360 185 L 330 170 L 295 156 L 268 138 L 262 122 Z" },
            { name: "两江新区", d: "M 400 188 L 442 180 L 472 162 L 515 172 L 512 215 L 480 232 L 450 225 L 428 208 Z" },
            { name: "璧山区",  d: "M 138 172 L 215 165 L 252 152 L 270 175 L 262 225 L 235 252 L 198 258 L 160 238 L 142 205 Z" },
            { name: "沙坪坝区", d: "M 252 152 L 268 138 L 295 156 L 330 170 L 335 195 L 315 215 L 285 222 L 262 225 L 270 175 Z" },
            { name: "江北区",  d: "M 330 170 L 360 185 L 400 188 L 428 208 L 425 232 L 395 245 L 360 248 L 335 238 L 322 218 L 335 195 Z" },
            { name: "渝中区",  d: "M 285 222 L 315 215 L 322 218 L 335 238 L 328 258 L 308 265 L 288 260 L 278 244 Z" },
            { name: "九龙坡区", d: "M 198 258 L 235 252 L 262 225 L 285 222 L 278 244 L 288 260 L 280 288 L 250 308 L 215 298 L 188 272 Z" },
            { name: "南岸区",  d: "M 308 265 L 328 258 L 335 238 L 360 248 L 395 245 L 425 232 L 450 225 L 462 258 L 448 302 L 408 322 L 365 322 L 330 308 L 308 285 Z" },
            { name: "大渡口区", d: "M 160 238 L 198 258 L 188 272 L 180 312 L 155 330 L 128 315 L 120 278 L 140 255 Z" },
            { name: "巴南区",  d: "M 215 298 L 250 308 L 280 288 L 308 285 L 330 308 L 365 322 L 408 322 L 422 355 L 378 370 L 308 368 L 248 358 L 195 342 L 178 320 L 180 312 L 188 272 Z" },
            { name: "永川区",  d: "M 52 238 L 108 198 L 138 172 L 160 238 L 140 255 L 120 278 L 105 322 L 78 342 L 42 320 L 35 278 L 42 250 Z" },
          ];

          // centroid helper
          const centroid = (d: string) => {
            const nums = d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
            const xs = nums.filter((_, i) => i % 2 === 0);
            const ys = nums.filter((_, i) => i % 2 === 1);
            return {
              cx: xs.reduce((a, b) => a + b, 0) / xs.length,
              cy: ys.reduce((a, b) => a + b, 0) / ys.length,
            };
          };

          return (
            <>
              {/* District fills */}
              {shapes.map(({ name, d }) => {
                const price = priceMap[name] ?? 10000;
                const isHov = hovered === name;
                return (
                  <path
                    key={`p-${name}`}
                    d={d}
                    fill={priceToColor(price)}
                    stroke="#fff"
                    strokeWidth={isHov ? 2 : 0.8}
                    opacity={isHov ? 1 : 0.88}
                    style={{ cursor: "pointer", transition: "opacity 0.15s, stroke-width 0.1s" }}
                    onMouseEnter={() => setHovered(name)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}

              {/* Yangtze River (长江) — west to east */}
              <path
                d="M 65 300 Q 140 292 188 272 Q 235 252 288 260 Q 330 265 380 268 Q 430 270 490 262"
                stroke="rgba(147,197,253,0.9)" strokeWidth="3.5" fill="none" strokeLinecap="round"
              />
              {/* Jialing River (嘉陵江) — northwest to confluence */}
              <path
                d="M 148 92 Q 180 130 210 165 Q 238 195 268 215 Q 280 232 288 260"
                stroke="rgba(147,197,253,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round"
              />

              {/* District labels — drawn last so they appear on top */}
              {shapes.map(({ name, d }) => {
                const { cx, cy } = centroid(d);
                const short = name.replace("区", "");
                return (
                  <text
                    key={`l-${name}`}
                    x={cx} y={cy + 4}
                    textAnchor="middle"
                    style={{ fontSize: 9.5, fill: "#fff", fontWeight: 700, pointerEvents: "none" }}
                    stroke="rgba(0,0,0,0.25)" strokeWidth="2.5" paintOrder="stroke"
                  >
                    {short}
                  </text>
                );
              })}
            </>
          );
        })()}
      </svg>

      {/* Color legend */}
      <div className="flex items-center gap-2 mt-1">
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>低价</span>
        <div className="flex-1 h-2 rounded-full" style={{ background: "linear-gradient(to right, rgb(22,58,112), rgb(230,126,34))" }} />
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>高价</span>
      </div>

      {/* Tooltip */}
      {hovered && priceMap[hovered] && (
        <div className="absolute top-2 right-2 px-3 py-2 rounded-lg shadow-lg" style={{ background: "#163A70", color: "#fff", fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>{hovered}</div>
          <div>{priceMap[hovered]?.toLocaleString()} 元/㎡</div>
        </div>
      )}
    </div>
  );
}
