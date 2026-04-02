import { ArrowUp } from "lucide-react";

interface StatCardProps {
  label: string;
  actual: number;
  planned: number;
  accentVar: string;
}

export function StatCard({ label, actual, planned, accentVar }: StatCardProps) {
  const progress = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
  const exceeded = actual > planned && planned > 0;
  const diff = actual - planned;

  return (
    <div className="bg-card rounded-card shadow-card p-5 space-y-3">
      <p className="text-sm font-body font-medium text-muted-foreground">{label}</p>

      <div className="flex items-end gap-2">
        <span
          className={`text-3xl font-heading font-bold ${
            exceeded ? "text-legatus-green" : "text-foreground"
          }`}
        >
          {actual}
        </span>
        {planned > 0 && (
          <span className="text-sm font-body text-muted-foreground mb-1">
            z {planned}
          </span>
        )}
        {exceeded && (
          <span className="inline-flex items-center gap-0.5 text-xs font-body font-semibold text-legatus-green bg-legatus-green/10 px-1.5 py-0.5 rounded-pill mb-1">
            <ArrowUp className="h-3 w-3" />+{diff}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            backgroundColor: `hsl(var(${accentVar}))`,
          }}
        />
      </div>
    </div>
  );
}
