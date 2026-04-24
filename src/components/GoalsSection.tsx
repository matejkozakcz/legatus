import { Pencil } from "lucide-react";
import { GaugeIndicator } from "@/components/GaugeIndicator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalGaugeItem {
  key: string;
  value: number;
  max: number;
  label: string;
  /** Volitelný popisek místo hodnoty uvnitř gauge (např. „1 240" pro velká čísla) */
  valueLabel?: string;
  /** Pokud max == 0 a chceme zobrazit jen aktuální hodnotu */
  placeholder?: boolean;
}

export interface GoalsSectionProps {
  /** Měsíční cíle (vždy první sekce, pokud existují) */
  monthlyGoals?: GoalGaugeItem[];
  /** Cíle vedoucí k povýšení */
  promotionGoals?: GoalGaugeItem[];
  /** Název role, na kterou uživatel směřuje (např. „Získatele", „Garanta") */
  promotionTargetRole?: string;
  /** Tmavé téma (uvnitř teal banneru na mobile) */
  dark?: boolean;
  /** Callback pro tlačítko úpravy cílů (jen pokud je definován) */
  onEditGoals?: () => void;
  /** Override nadpisu měsíční sekce (např. „Cíle pro Duben 2026"). Když undefined a `hideMonthlyTitle` je false → výchozí „Měsíční cíle". */
  monthlyTitle?: string;
  /** Skrýt nadpis měsíční sekce úplně. */
  hideMonthlyTitle?: boolean;
  /** Kompaktní gauges (menší – pro mobil, aby se vešly vedle sebe). */
  compact?: boolean;
  /** Zobrazit gauges pod sebou (sloupec) místo vedle sebe. */
  stacked?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSublabel(item: GoalGaugeItem): string | undefined {
  if (item.placeholder || item.max === 0) return undefined;
  if (item.value >= item.max) return "✓ Splněno";
  return `${item.value} z ${item.max.toLocaleString("cs-CZ")}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "Open Sans, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: dark ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
        textAlign: "center",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function GaugeRow({ items, dark, compact, stacked }: { items: GoalGaugeItem[]; dark?: boolean; compact?: boolean; stacked?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        flexWrap: stacked ? "nowrap" : "nowrap",
        justifyContent: "center",
        alignItems: "center",
        gap: stacked ? 12 : items.length > 1 ? (compact ? 4 : 8) : 0,
      }}
    >
      {items.map((item) => (
        <GaugeIndicator
          key={item.key}
          value={item.value}
          max={item.max || 1}
          label={item.label}
          sublabel={buildSublabel(item)}
          placeholder={item.placeholder || item.max === 0}
          valueLabel={item.valueLabel ?? (item.max === 0 ? String(item.value) : undefined)}
          dark={dark}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function GoalsSection({
  monthlyGoals = [],
  promotionGoals = [],
  promotionTargetRole,
  dark = false,
  onEditGoals,
  monthlyTitle,
  hideMonthlyTitle = false,
  compact = false,
}: GoalsSectionProps) {
  const hasMonthly = monthlyGoals.length > 0;
  const hasPromotion = promotionGoals.length > 0;

  if (!hasMonthly && !hasPromotion) return null;

  const resolvedMonthlyTitle = monthlyTitle ?? "Měsíční cíle";

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
      {onEditGoals && (
        <button
          onClick={onEditGoals}
          aria-label="Upravit cíle"
          style={{
            position: "absolute",
            top: dark ? 0 : -2,
            right: 0,
            zIndex: 2,
            background: dark ? "rgba(255,255,255,0.15)" : "transparent",
            border: dark ? "none" : "1px solid var(--border)",
            borderRadius: 8,
            padding: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: dark ? "rgba(255,255,255,0.85)" : "#00abbd",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "Open Sans, sans-serif",
          }}
        >
          <Pencil size={12} />
          {!dark && <span>Upravit</span>}
        </button>
      )}

      {hasMonthly && (
        <div>
          {!hideMonthlyTitle && <SectionTitle dark={dark}>{resolvedMonthlyTitle}</SectionTitle>}
          <GaugeRow items={monthlyGoals} dark={dark} compact={compact} />
        </div>
      )}

      {hasMonthly && hasPromotion && (
        <div
          style={{
            height: 1,
            background: dark ? "rgba(255,255,255,0.15)" : "var(--border)",
            margin: "0 8px",
          }}
        />
      )}

      {hasPromotion && (
        <div>
          <SectionTitle dark={dark}>
            {promotionTargetRole ? `Postup k povýšení na ${promotionTargetRole}` : "Postup k povýšení"}
          </SectionTitle>
          <GaugeRow items={promotionGoals} dark={dark} compact={compact} />
        </div>
      )}
    </div>
  );
}
