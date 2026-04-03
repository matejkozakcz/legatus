interface GaugeIndicatorProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  placeholder?: boolean;
  dark?: boolean;
}

export function GaugeIndicator({ value, max, label, sublabel, placeholder = false, dark = false }: GaugeIndicatorProps) {
  const radius = 70;
  const stroke = 12;
  const cx = 90;
  const cy = 85;
  const circumference = Math.PI * radius;
  const ratio = placeholder || max === 0 ? 0 : Math.min(1, value / max);
  const dashOffset = circumference * (1 - ratio);

  const bgArc = dark ? "rgba(255,255,255,0.18)" : "#e2eaec";
  const valueColor = dark ? (placeholder ? "rgba(255,255,255,0.4)" : "#ffffff") : (placeholder ? "#b8cfd4" : "#00555f");
  const maxColor = dark ? "rgba(255,255,255,0.7)" : "#00abbd";
  const labelColor = dark ? "rgba(255,255,255,0.85)" : "#4a6b70";
  const sublabelColor = dark ? "rgba(255,255,255,0.6)" : "#8aadb3";
  const gradId = dark ? "gaugeGradDark" : "gaugeGrad";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={180} height={100} viewBox="0 0 180 100" style={{ overflow: "visible" }}>
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={bgArc}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {!placeholder && (
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        )}
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={dark ? "#fc7c71" : "#00555f"} />
            <stop offset="100%" stopColor={dark ? "#ffb4a9" : "#00abbd"} />
          </linearGradient>
        </defs>
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: 32, fill: valueColor }}
        >
          {placeholder ? "—" : value}
        </text>
        {!placeholder && max > 0 && (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: 14, fill: maxColor }}
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
          color: labelColor,
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
            color: sublabelColor,
            textAlign: "center",
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}
