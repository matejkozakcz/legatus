interface StatCardProps {
  label: string;
  actual: number;
  planned: number;
  actualLabel: string;
  plannedLabel: string;
}

export function StatCard({ label, actual, planned, actualLabel, plannedLabel }: StatCardProps) {
  return (
    <div className="stat-card flex flex-col gap-2">
      <p
        className="font-body text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "#fc7c71" }}
      >
        {label}
      </p>

      <div className="flex items-baseline gap-1.5">
        <span className="font-heading text-4xl font-bold leading-none" style={{ color: "#00555f" }}>
          {actual}
        </span>
        <span className="font-body text-xl font-semibold" style={{ color: "#00abbd" }}>
          z {planned}
        </span>
      </div>

      <div className="flex gap-1 font-body text-xs text-muted-foreground">
        <span>{actualLabel}</span>
        <span>/</span>
        <span>{plannedLabel}</span>
      </div>
    </div>
  );
}
