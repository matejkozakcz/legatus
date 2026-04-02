import { ArrowUp } from "lucide-react";

interface StatCardProps {
  label: string;
  actual: number;
  planned: number;
  accentColor: string;
}

export function StatCard({ label, actual, planned, accentColor }: StatCardProps) {
  const progress = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
  const exceeded = actual > planned && planned > 0;
  const diff = actual - planned;

  return (
    <div className="stat-card flex flex-col gap-3">
      {/* Category label */}
      <p
        className="font-body text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: accentColor }}
      >
        {label}
      </p>

      {/* Value */}
      <div className="flex items-end gap-2">
        <span
          className="font-heading text-4xl font-bold leading-none"
          style={{ color: exceeded ? "#16a34a" : "#0c2226" }}
        >
          {actual}
        </span>
        {planned > 0 && (
          <span className="text-[13px] font-body mb-1" style={{ color: "#8aadb3" }}>
            z {planned}
          </span>
        )}
        {exceeded && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-body font-semibold rounded-full px-2 py-0.5 mb-1"
            style={{ background: "#f0fdf4", color: "#16a34a" }}
          >
            <ArrowUp className="h-3 w-3" />+{diff}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${progress}%`,
            backgroundColor: accentColor,
          }}
        />
      </div>
    </div>
  );
}
