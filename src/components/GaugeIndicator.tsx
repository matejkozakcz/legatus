interface GaugeIndicatorProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  placeholder?: boolean;
  dark?: boolean;
  /** Gauge se vybarví zeleně, pokud je podmínka splněna (value >= max) */
  completed?: boolean;
}

export function GaugeIndicator({ value, max, label, sublabel, placeholder = false, dark = false, completed = false }: GaugeIndicatorProps) {
  const radius = 70;
  const stroke = 12;
  const cx = 90;
  const cy = 85;
  const circumference = Math.PI * radius;
  const ratio = placeholder || max === 0 ? 0 : Math.min(1, value / max);
  const dashOffset = circumference * (1 - ratio);

  const isDone = completed && !placeholder && max > 0 && value >= max;

  const bgArc = dark ? "rgba(255,255,255,0.18)" : "#e2eaec";

  const valueColor = isDone
    ? (dark ? "#86efac" : "#15803d")
    : dark
      ? (placeholder ? "rgba(255,255,255,0.4)" : "#ffffff")
      : (placeholder ? "#b8cfd4" : "#00555f");

  const maxColor = isDone
    ? (dark ? "#86efac" : "#15803d")
    : dark ? "rgba(255,255,255,0.7)" : "#00abbd";

  const labelColor = dark ? "rgba(255,255,255,0.85)" : "var(--text-secondary)";
  const sublabelColor = dark ? "rgba(255,255,255,0.6)" : "var(--text-muted)";

  // Unikátní gradient ID podle kombinace dark + completed
  const gradId = `gaugeGrad${dark ? "Dark" : ""}${isDone ? "Green" : ""}`;
  const gradStart = isDone ? "#22c55e" : dark ? "#fc7c71" : "#00555f";
  const gradEnd   = isDone ? "#16a34a" : dark ? "#ffb4a9" : "#00abbd";

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
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
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
