export function ChongqingSkyline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 200" className={className} preserveAspectRatio="xMidYMax meet" fill="none">
      {/* Mountains background */}
      <path d="M0 180 Q100 120 160 140 Q220 100 280 130 Q340 90 400 110 Q460 80 520 100 Q580 70 640 95 Q700 75 760 90 L800 80 L800 200 L0 200 Z" fill="rgba(79,125,189,0.15)" />
      {/* Buildings */}
      <rect x="60" y="130" width="30" height="70" rx="2" fill="rgba(79,125,189,0.4)" />
      <rect x="65" y="110" width="20" height="20" fill="rgba(79,125,189,0.4)" />
      <rect x="72" y="100" width="6" height="10" fill="rgba(79,125,189,0.4)" />
      <rect x="100" y="115" width="40" height="85" rx="2" fill="rgba(79,125,189,0.5)" />
      <rect x="108" y="100" width="24" height="15" fill="rgba(79,125,189,0.5)" />
      <rect x="150" y="125" width="25" height="75" rx="2" fill="rgba(79,125,189,0.35)" />
      <rect x="185" y="105" width="45" height="95" rx="2" fill="rgba(79,125,189,0.55)" />
      <rect x="192" y="90" width="31" height="15" fill="rgba(79,125,189,0.55)" />
      <rect x="205" y="80" width="5" height="10" fill="rgba(79,125,189,0.55)" />
      <rect x="240" y="120" width="35" height="80" rx="2" fill="rgba(79,125,189,0.4)" />
      <rect x="285" y="100" width="28" height="100" rx="2" fill="rgba(79,125,189,0.5)" />
      <rect x="290" y="85" width="18" height="15" fill="rgba(79,125,189,0.5)" />
      <rect x="297" y="75" width="4" height="10" fill="rgba(79,125,189,0.5)" />
      <rect x="325" y="130" width="22" height="70" rx="2" fill="rgba(79,125,189,0.3)" />
      {/* Yangtze River bridge */}
      <path d="M350 175 Q500 155 650 170" stroke="rgba(79,125,189,0.5)" strokeWidth="3" />
      <line x1="390" y1="155" x2="390" y2="175" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      <line x1="430" y1="150" x2="430" y2="170" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      <line x1="470" y1="148" x2="470" y2="168" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      <line x1="510" y1="152" x2="510" y2="172" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      <line x1="550" y1="156" x2="550" y2="176" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      <line x1="590" y1="160" x2="590" y2="178" stroke="rgba(79,125,189,0.4)" strokeWidth="2" />
      {/* More buildings right */}
      <rect x="660" y="110" width="50" height="90" rx="2" fill="rgba(79,125,189,0.5)" />
      <rect x="668" y="95" width="34" height="15" fill="rgba(79,125,189,0.5)" />
      <rect x="682" y="82" width="6" height="13" fill="rgba(79,125,189,0.5)" />
      <rect x="720" y="125" width="28" height="75" rx="2" fill="rgba(79,125,189,0.4)" />
      <rect x="758" y="115" width="32" height="85" rx="2" fill="rgba(79,125,189,0.45)" />
      {/* Water */}
      <path d="M0 185 Q200 178 400 183 Q600 178 800 182 L800 200 L0 200 Z" fill="rgba(79,125,189,0.2)" />
      {/* "1906" watermark */}
      <text x="720" y="165" style={{ fontSize: 48, fill: "rgba(79,125,189,0.1)", fontWeight: 700 }}>1906</text>
    </svg>
  );
}
