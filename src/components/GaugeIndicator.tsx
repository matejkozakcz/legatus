interface GaugeIndicatorProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  placeholder?: boolean;
}

export function GaugeIndicator({ value, max, label, sublabel, placeholder = false }: GaugeIndicatorProps) {
  const radius = 70;
  const stroke = 12;
  const cx = 90;
  const cy = 85;
  // Semicircle arc length
  const circumference = Math.PI * radius;
  const ratio = placeholder || max === 0 ? 0 : Math.min(1, value / max);
  const dashOffset = circumference * (1 - ratio);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={180} height={100} viewBox="0 0 180 100" style={{ overflow: "visible" }}>
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#e2eaec"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {!placeholder && (
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        )}
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00555f" />
            <stop offset="100%" stopColor="#00abbd" />
          </linearGradient>
        </defs>
        {/* Center text */}
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 32, fill: placeholder ? "#b8cfd4" : "#00555f" }}
        >
          {placeholder ? "—" : value}
        </text>
        {!placeholder && max > 0 && (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 14, fill: "#00abbd" }}
          >
            z {max}
          </text>
        )}
      </svg>
      <span
        style={{
          fontFamily: "Open Sans, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#4a6b70",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          style={{
            fontFamily: "Open Sans, sans-serif",
            fontSize: 11,
            color: "#8aadb3",
            textAlign: "center",
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}
