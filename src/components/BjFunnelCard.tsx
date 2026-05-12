import { ArrowRight } from "lucide-react";
import type { BjFunnel } from "@/lib/bjFunnel";

interface BjFunnelCardProps {
  funnel: BjFunnel;
  /** Volitelný titulek nad kartami. */
  title?: string;
  /** Kompaktní varianta (menší fonty, vhodné do hlaviček a do detailů). */
  compact?: boolean;
}

function formatBj(n: number): string {
  return Math.round(n).toLocaleString("cs-CZ");
}

function Step({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: number;
  accent: string;
  compact?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 flex-1 min-w-0"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: compact ? "10px 12px" : "14px 16px",
      }}
    >
      <span
        className="font-body font-semibold uppercase truncate"
        style={{
          fontSize: compact ? 10 : 11,
          letterSpacing: "0.08em",
          color: accent,
        }}
      >
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="font-heading font-bold leading-none"
          style={{
            fontSize: compact ? 24 : 32,
            color: "#00555f",
          }}
        >
          {formatBj(value)}
        </span>
        <span className="font-body text-xs" style={{ color: "var(--text-muted)" }}>
          BJ
        </span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <ArrowRight
      className="flex-shrink-0 hidden sm:block"
      style={{ color: "var(--text-muted)", opacity: 0.5 }}
      size={18}
    />
  );
}

export function BjFunnelCard({ funnel, title, compact }: BjFunnelCardProps) {
  const conversionPct =
    funnel.planned > 0 ? Math.round((funnel.realized / funnel.planned) * 100) : null;

  return (
    <div className="flex flex-col gap-2 w-full">
      {title && (
        <div
          className="font-body font-semibold uppercase"
          style={{
            fontSize: 12,
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
          }}
        >
          {title}
        </div>
      )}
      <div className="flex items-stretch gap-2 sm:gap-3 w-full">
        <Step label="Plánované" value={funnel.planned} accent="#00abbd" compact={compact} />
        <Arrow />
        <Step label="Rozpracované" value={funnel.inProgress} accent="#00abbd" compact={compact} />
        <Arrow />
        <Step label="Realizované" value={funnel.realized} accent="#fc7c71" compact={compact} />
      </div>
      {conversionPct != null && (
        <div
          className="font-body text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Realizováno z plánovaných: <strong style={{ color: "#00555f" }}>{conversionPct} %</strong>
        </div>
      )}
    </div>
  );
}
