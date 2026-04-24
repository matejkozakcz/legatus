interface GaugeIndicatorProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  placeholder?: boolean;
  dark?: boolean;
  /** Gauge se vybarví zeleně, pokud je podmínka splněna (value >= max) */
  completed?: boolean;
  /** Přepíše zobrazovanou hodnotu ve středu gauge (místo raw value) */
  valueLabel?: string;
  /** Zmenšená varianta pro mobil — užší, aby se vedle sebe vešly 2–3 ks. */
  compact?: boolean;
}

export function GaugeIndicator({ value, max, label, sublabel, placeholder = false, dark = false, completed = false, valueLabel, compact = false }: GaugeIndicatorProps) {
  const radius = compact ? 48 : 70;
  const stroke = compact ? 9 : 12;
  const cx = compact ? 60 : 90;
  const cy = compact ? 60 : 85;
  const circumference = Math.PI * radius;
  const ratio = placeholder || max === 0 ? 0 : Math.min(1, value / max);
  const dashOffset = circumference * (1 - ratio);

  const isDone = !placeholder && max > 0 && value >= max;

  const bgArc = dark ? "rgba(255,255,255,0.18)" : "#e2eaec";

  // Plynulá barevná škála podle ratio: červená → oranžová → žlutá → zelená
  // 0 % = červená (#ef4444), 50 % = žlutá (#f59e0b), 100 % = zelená (#22c55e)
  const getRatioColors = (r: number): { start: string; end: string } => {
    if (placeholder || max === 0) {
      return dark
        ? { start: "rgba(255,255,255,0.3)", end: "rgba(255,255,255,0.4)" }
        : { start: "#cbd5d8", end: "#b8cfd4" };
    }
    if (isDone) return { start: "#22c55e", end: "#16a34a" }; // zelená
    if (r >= 0.66) return { start: "#84cc16", end: "#22c55e" }; // limetková → zelená
    if (r >= 0.33) return { start: "#f59e0b", end: "#eab308" }; // oranžová → žlutá
    return { start: "#ef4444", end: "#f97316" }; // červená → oranžová
  };

  const { start: gradStart, end: gradEnd } = getRatioColors(ratio);

  const valueColor = placeholder
    ? (dark ? "rgba(255,255,255,0.4)" : "#b8cfd4")
    : isDone
      ? (dark ? "#86efac" : "#15803d")
      : (dark ? "#ffffff" : "var(--text-primary)");

  const maxColor = isDone
    ? (dark ? "#86efac" : "#15803d")
    : dark ? "rgba(255,255,255,0.7)" : "var(--text-muted)";

  const labelColor = dark ? "rgba(255,255,255,0.85)" : "var(--text-secondary)";
  const sublabelColor = dark ? "rgba(255,255,255,0.6)" : "var(--text-muted)";

  // Unikátní gradient ID podle ratio bucketu (aby se dva gauge nenavzájem nepřepisovaly)
  const bucket = placeholder || max === 0 ? "ph" : isDone ? "done" : ratio >= 0.66 ? "high" : ratio >= 0.33 ? "mid" : "low";
  const gradId = `gaugeGrad${dark ? "Dark" : ""}${bucket}`;

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
          y={valueLabel ? cy - 8 : cy - 16}
          textAnchor="middle"
          style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: valueLabel ? 26 : 32, fill: valueColor }}
        >
          {placeholder ? "—" : (valueLabel ?? value)}
        </text>
        {!placeholder && max > 0 && !valueLabel && (
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
