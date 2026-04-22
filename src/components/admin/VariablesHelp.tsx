import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// ─── Variables catalog ───────────────────────────────────────────────────────
//
// Definuje, které proměnné jsou k dispozici v jakém spouštěči.
// Klíče odpovídají skutečným hodnotám předávaným z edge funkce
// `run-scheduled-notifications` (viz insertNotifications + handlery).

interface VariableDef {
  key: string;
  label: string;
  example: string;
}

interface VariableGroup {
  triggers: string[]; // prázdné = univerzální
  title: string;
  vars: VariableDef[];
}

const GROUPS: VariableGroup[] = [
  {
    triggers: [],
    title: "Univerzální (všechna pravidla)",
    vars: [
      { key: "member_name", label: "Jméno příjemce", example: "Jan Novák" },
      { key: "member_role", label: "Role příjemce", example: "ziskatel" },
    ],
  },
  {
    triggers: ["scheduled.unrecorded_meetings", "meeting_outcome_missing"],
    title: "Nezadané výsledky schůzek",
    vars: [
      { key: "count", label: "Počet schůzek bez výsledku", example: "3" },
      { key: "oldest_date", label: "Datum nejstarší schůzky", example: "2026-04-15" },
    ],
  },
  {
    triggers: ["scheduled.weekly_report", "weekly_low_activity"],
    title: "Týdenní report",
    vars: [
      { key: "meeting_count", label: "Počet schůzek za týden", example: "12" },
      { key: "total_bj", label: "Součet podepsaných BJ", example: "8" },
      { key: "week_start", label: "Začátek týdne (Po)", example: "2026-04-13" },
      { key: "week_end", label: "Konec týdne (Ne)", example: "2026-04-19" },
    ],
  },
  {
    triggers: ["scheduled.inactive_days"],
    title: "Bez aktivity",
    vars: [
      { key: "inactive_days", label: "Počet dní bez schůzky", example: "3" },
    ],
  },
  {
    triggers: [
      "promotion_eligible",
      "promotion_approved",
      "promotion_rejected",
    ],
    title: "Povýšení",
    vars: [
      { key: "new_role", label: "Nová role po povýšení", example: "Garant" },
      { key: "sender_name", label: "Jméno odesílatele (admin)", example: "Petr Admin" },
    ],
  },
  {
    triggers: ["onboarding_completed"],
    title: "Onboarding",
    vars: [
      { key: "sender_name", label: "Jméno nového uživatele", example: "Eva Nováčková" },
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
    <aside className="hidden lg:flex flex-col w-72 shrink-0 border-l border-border bg-muted/20">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-heading font-semibold text-foreground">
          Proměnné v šabloně
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Použij <code className="text-foreground">{`{{nazev}}`}</code> v titulku/těle. Při odeslání se nahradí skutečnou hodnotou.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {relevant.map((g) => (
            <VarGroup key={g.title} group={g} highlighted />
          ))}
          {other.length > 0 && (
            <>
              <div className="pt-2 border-t border-border/60">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Pro jiné spouštěče
                </p>
              </div>
              {other.map((g) => (
                <VarGroup key={g.title} group={g} />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function VarGroup({ group, highlighted = false }: { group: VariableGroup; highlighted?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className={`text-xs font-semibold ${highlighted ? "text-foreground" : "text-muted-foreground"}`}>
          {group.title}
        </h4>
        {highlighted && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            Aktivní
          </Badge>
        )}
      </div>
      <ul className="space-y-1.5">
        {group.vars.map((v) => (
          <li key={v.key} className="text-[11px] leading-tight">
            <code className="font-mono text-[11px] text-foreground bg-muted px-1.5 py-0.5 rounded">
              {`{{${v.key}}}`}
            </code>
            <span className="text-muted-foreground ml-1.5">{v.label}</span>
            <div className="text-[10px] text-muted-foreground/80 ml-1 mt-0.5">
              např. <span className="italic">{v.example}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
