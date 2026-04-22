import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Sparkles, Copy, Check } from "lucide-react";
import { useState } from "react";

// ─── Variables catalog ───────────────────────────────────────────────────────
//
// Definuje, které proměnné jsou k dispozici v jakém spouštěči.
// Klíče odpovídají skutečným hodnotám předávaným z edge funkce
// `run-scheduled-notifications` (viz insertNotifications + handlery).

interface VariableDef {
  key: string;
  label: string;
  example: string;
  description?: string;
}

interface VariableGroup {
  triggers: string[]; // prázdné = univerzální
  title: string;
  hint?: string;
  vars: VariableDef[];
}

const GROUPS: VariableGroup[] = [
  {
    triggers: [],
    title: "Univerzální",
    hint: "Dostupné ve všech pravidlech",
    vars: [
      {
        key: "member_name",
        label: "Jméno příjemce",
        example: "Jan Novák",
        description: "Celé jméno uživatele, kterému notifikace přijde.",
      },
      {
        key: "member_role",
        label: "Role příjemce",
        example: "ziskatel",
        description: "Aktuální role v systému (ziskatel, garant, vedouci…).",
      },
    ],
  },
  {
    triggers: ["scheduled.unrecorded_meetings", "meeting_outcome_missing"],
    title: "Nezadané výsledky schůzek",
    hint: "Připomínka k vyplnění výsledku po schůzce",
    vars: [
      {
        key: "count",
        label: "Počet schůzek bez výsledku",
        example: "3",
        description: "Kolik schůzek čeká na zadání výsledku.",
      },
      {
        key: "oldest_date",
        label: "Datum nejstarší schůzky",
        example: "2026-04-15",
        description: "Nejdéle čekající schůzka bez výsledku (formát YYYY-MM-DD).",
      },
    ],
  },
  {
    triggers: ["scheduled.weekly_report", "weekly_low_activity"],
    title: "Týdenní report",
    hint: "Souhrn aktivity za uplynulý týden",
    vars: [
      {
        key: "meeting_count",
        label: "Počet schůzek za týden",
        example: "12",
        description: "Celkový počet schůzek (včetně zrušených).",
      },
      {
        key: "total_bj",
        label: "Součet podepsaných BJ",
        example: "8",
        description: "Suma BJ ze všech podepsaných smluv.",
      },
      {
        key: "week_start",
        label: "Začátek týdne (Po)",
        example: "2026-04-13",
        description: "Pondělí týdne, za který je report.",
      },
      {
        key: "week_end",
        label: "Konec týdne (Ne)",
        example: "2026-04-19",
        description: "Neděle týdne, za který je report.",
      },
    ],
  },
  {
    triggers: ["scheduled.custom_time"],
    title: "V určený čas",
    hint: "Notifikace odeslaná podle cronu, bez dalších podmínek",
    vars: [
      {
        key: "now_time",
        label: "Aktuální čas (HH:MM)",
        example: "09:00",
        description: "Čas spuštění v Europe/Prague.",
      },
      {
        key: "now_date",
        label: "Aktuální datum",
        example: "2026-04-22",
        description: "Datum spuštění (YYYY-MM-DD).",
      },
    ],
  },
  {
    triggers: ["scheduled.inactive_days"],
    title: "Bez aktivity",
    hint: "Notifikace při delší pauze",
    vars: [
      {
        key: "inactive_days",
        label: "Počet dní bez schůzky",
        example: "3",
        description: "Kolik dní v řadě uživatel neměl žádnou schůzku.",
      },
    ],
  },
  {
    triggers: ["promotion_eligible", "promotion_approved", "promotion_rejected"],
    title: "Povýšení",
    hint: "Změny rolí a žádosti o povýšení",
    vars: [
      {
        key: "new_role",
        label: "Nová role po povýšení",
        example: "Garant",
        description: "Název role, na kterou byl uživatel povýšen.",
      },
      {
        key: "sender_name",
        label: "Jméno odesílatele (admin)",
        example: "Petr Admin",
        description: "Kdo povýšení schválil/zamítl.",
      },
    ],
  },
  {
    triggers: ["onboarding_completed"],
    title: "Onboarding",
    hint: "Po dokončení registrace nového uživatele",
    vars: [
      {
        key: "sender_name",
        label: "Jméno nového uživatele",
        example: "Eva Nováčková",
        description: "Jméno uživatele, který dokončil onboarding.",
      },
    ],
  },
];

interface VariablesHelpProps {
  trigger: string;
}

export function VariablesHelp({ trigger }: VariablesHelpProps) {
  const relevant = GROUPS.filter(
    (g) => g.triggers.length === 0 || g.triggers.includes(trigger),
  );
  const other = GROUPS.filter(
    (g) => g.triggers.length > 0 && !g.triggers.includes(trigger),
  );

  return (
    <aside className="hidden lg:flex flex-col w-[360px] shrink-0 bg-background border-0 overflow-hidden h-full"
      style={{ borderRadius: 28, boxShadow: "0 8px 32px rgba(0,85,95,0.22)" }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-heading font-semibold text-foreground leading-none">
              Legenda proměnných
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Použij <code className="text-foreground bg-muted px-1 py-0.5 rounded text-[10px]">{`{{nazev}}`}</code> v titulku nebo těle
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Active section */}
          {relevant.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <h4 className="text-[10px] uppercase tracking-wider font-bold text-accent">
                  Aktivní pro tento trigger
                </h4>
              </div>
              <div className="space-y-4">
                {relevant.map((g) => (
                  <VarGroup key={g.title} group={g} highlighted />
                ))}
              </div>
            </div>
          )}

          {/* Other sections */}
          {other.length > 0 && (
            <div className="pt-4 border-t border-border/60">
              <h4 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-3">
                Pro jiné spouštěče
              </h4>
              <div className="space-y-4">
                {other.map((g) => (
                  <VarGroup key={g.title} group={g} />
                ))}
              </div>
            </div>
          )}

          {/* Tip footer */}
          <div className="pt-4 border-t border-border/60">
            <div className="rounded-lg bg-accent/5 border border-accent/20 p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Tip:</span> Klikni na proměnnou pro zkopírování. Pokud proměnná nemá v daném kontextu hodnotu, zobrazí se prázdný řetězec.
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function VarGroup({ group, highlighted = false }: { group: VariableGroup; highlighted?: boolean }) {
  return (
    <div className={highlighted ? "" : "opacity-75"}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h5 className="text-xs font-semibold text-foreground">{group.title}</h5>
        {highlighted && (
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 py-0 bg-accent/15 text-accent border-0"
          >
            Aktivní
          </Badge>
        )}
      </div>
      {group.hint && (
        <p className="text-[10px] text-muted-foreground mb-2 leading-snug">{group.hint}</p>
      )}
      <ul className="space-y-2">
        {group.vars.map((v) => (
          <VarItem key={v.key} v={v} />
        ))}
      </ul>
    </div>
  );
}

function VarItem({ v }: { v: VariableDef }) {
  const [copied, setCopied] = useState(false);
  const token = `{{${v.key}}}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <li className="group rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-border transition-colors p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-[11px] text-foreground bg-background border border-border px-1.5 py-0.5 rounded hover:border-accent transition-colors flex items-center gap-1.5"
          title="Kliknutím zkopíruj"
        >
          {token}
          {copied ? (
            <Check className="h-3 w-3 text-accent" />
          ) : (
            <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>
      <p className="text-[11px] font-medium text-foreground leading-tight">{v.label}</p>
      {v.description && (
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
          {v.description}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground/80 mt-1">
        Např. <span className="italic font-mono text-foreground/70">{v.example}</span>
      </p>
    </li>
  );
}
