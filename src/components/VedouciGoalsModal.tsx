import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Target, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGoalConfiguration } from "@/hooks/useGoalConfiguration";

export type GoalKey =
  | "team_bj"
  | "personal_bj"
  | "vedouci_count"
  | "budouci_vedouci_count"
  | "garant_count"
  | "ziskatel_count";

const ROLE_COUNT_LABELS: Record<string, string> = {
  vedouci: "Počet Vedoucích",
  budouci_vedouci: "Počet Budoucích vedoucích",
  garant: "Počet Garantů",
  ziskatel: "Lidi po SV",
};

const ROLE_TO_GOAL_KEY: Record<string, GoalKey> = {
  vedouci: "vedouci_count",
  budouci_vedouci: "budouci_vedouci_count",
  garant: "garant_count",
  ziskatel: "ziskatel_count",
};

export interface GoalOption {
  key: GoalKey;
  label: string;
  placeholder: string;
  goalField: string;
}

// Static base options — filtered by admin config
const BASE_GOAL_OPTIONS: GoalOption[] = [
  { key: "team_bj", label: "Týmové BJ", placeholder: "např. 5000", goalField: "team_bj_goal" },
  { key: "personal_bj", label: "Osobní BJ", placeholder: "např. 500", goalField: "personal_bj_goal" },
  { key: "vedouci_count", label: "Počet Vedoucích", placeholder: "0", goalField: "vedouci_count_goal" },
  {
    key: "budouci_vedouci_count",
    label: "Počet Budoucích vedoucích",
    placeholder: "0",
    goalField: "budouci_vedouci_count_goal",
  },
  { key: "garant_count", label: "Počet Garantů", placeholder: "0", goalField: "garant_count_goal" },
  { key: "ziskatel_count", label: "Lidi po SV", placeholder: "0", goalField: "ziskatel_count_goal" },
];

// Exported for Dashboard usage
export const GOAL_OPTIONS = BASE_GOAL_OPTIONS;

const PEOPLE_GOAL_KEYS: GoalKey[] = ["vedouci_count", "budouci_vedouci_count", "garant_count", "ziskatel_count"];
type ScopeValue = "direct" | "structure";
type CountType = "total" | "increment";

interface FormData {
  selected_goal_1: GoalKey;
  selected_goal_2: GoalKey | "";
  team_bj_goal: number;
  personal_bj_goal: number;
  vedouci_count_goal: number;
  budouci_vedouci_count_goal: number;
  garant_count_goal: number;
  ziskatel_count_goal: number;
  vedouci_count_scope: ScopeValue;
  budouci_vedouci_count_scope: ScopeValue;
  garant_count_scope: ScopeValue;
  ziskatel_count_scope: ScopeValue;
  vedouci_count_type: CountType;
  budouci_vedouci_count_type: CountType;
  garant_count_type: CountType;
  ziskatel_count_type: CountType;
}

const defaultForm: FormData = {
  selected_goal_1: "team_bj",
  selected_goal_2: "",
  team_bj_goal: 0,
  personal_bj_goal: 0,
  vedouci_count_goal: 0,
  budouci_vedouci_count_goal: 0,
  garant_count_goal: 0,
  ziskatel_count_goal: 0,
  vedouci_count_scope: "direct",
  budouci_vedouci_count_scope: "direct",
  garant_count_scope: "direct",
  ziskatel_count_scope: "direct",
  vedouci_count_type: "total",
  budouci_vedouci_count_type: "total",
  garant_count_type: "total",
  ziskatel_count_type: "total",
};

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  periodKey: string;
  onSaved: () => void;
  role?: string;
}

export function VedouciGoalsModal({ open, onClose, userId, periodKey, onSaved, role }: Props) {
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch admin goal configuration for the user's role
  const { goals: adminGoals, rawConfig } = useGoalConfiguration(role);

  // Build available goal options dynamically from admin config
  const availableGoalOptions: GoalOption[] = useMemo(() => {
    if (!rawConfig || !role || !rawConfig[role]) {
      // Fallback to legacy options if no admin config
      return BASE_GOAL_OPTIONS.filter((g) =>
        ["team_bj", "personal_bj", "vedouci_count", "budouci_vedouci_count", "garant_count"].includes(g.key),
      );
    }

    const roleConfig = rawConfig[role];
    const options: GoalOption[] = [];

    // Add team_bj if configured
    if (roleConfig.team_bj) {
      options.push(BASE_GOAL_OPTIONS.find((g) => g.key === "team_bj")!);
    }

    // Always offer personal_bj as an option for roles that have monthly_bj
    if (roleConfig.monthly_bj) {
      options.push(BASE_GOAL_OPTIONS.find((g) => g.key === "personal_bj")!);
    }

    // Add promotion targets as count goals
    if (roleConfig.promotions) {
      for (const promo of roleConfig.promotions) {
        const goalKey = ROLE_TO_GOAL_KEY[promo.role];
        if (goalKey) {
          const existing = BASE_GOAL_OPTIONS.find((g) => g.key === goalKey);
          if (existing) {
            options.push(existing);
          }
        }
      }
    }

    return options.length > 0 ? options : BASE_GOAL_OPTIONS.slice(0, 2);
  }, [rawConfig, role]);

  // Doporučené defaults pro count_type podle admin konfigurace (pokud
  // admin u dané promotion role nastavil "increment" jako výchozí, nový
  // uživatel to dostane jako pre-select; uživatel však může změnit).
  const defaultTypeForRole = (roleKey: string): CountType => {
    if (!rawConfig || !role) return "total";
    const promos = rawConfig[role]?.promotions || [];
    const match = promos.find((p) => p.role === roleKey);
    return (match?.type as CountType) || "total";
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("vedouci_goals" as any)
      .select("*")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setForm({
            selected_goal_1: d.selected_goal_1 || availableGoalOptions[0]?.key || "team_bj",
            selected_goal_2: d.selected_goal_2 || "",
            team_bj_goal: d.team_bj_goal || 0,
            personal_bj_goal: d.personal_bj_goal || 0,
            vedouci_count_goal: d.vedouci_count_goal || 0,
            budouci_vedouci_count_goal: d.budouci_vedouci_count_goal || 0,
            garant_count_goal: d.garant_count_goal || 0,
            ziskatel_count_goal: d.ziskatel_count_goal || 0,
            vedouci_count_scope: d.vedouci_count_scope || "direct",
            budouci_vedouci_count_scope: d.budouci_vedouci_count_scope || "direct",
            garant_count_scope: d.garant_count_scope || "direct",
            ziskatel_count_scope: d.ziskatel_count_scope || "direct",
            vedouci_count_type: d.vedouci_count_type || defaultTypeForRole("vedouci"),
            budouci_vedouci_count_type: d.budouci_vedouci_count_type || defaultTypeForRole("budouci_vedouci"),
            garant_count_type: d.garant_count_type || defaultTypeForRole("garant"),
            ziskatel_count_type: d.ziskatel_count_type || defaultTypeForRole("ziskatel"),
          });
        } else {
          setForm({
            ...defaultForm,
            selected_goal_1: availableGoalOptions[0]?.key || "team_bj",
            vedouci_count_type: defaultTypeForRole("vedouci"),
            budouci_vedouci_count_type: defaultTypeForRole("budouci_vedouci"),
            garant_count_type: defaultTypeForRole("garant"),
            ziskatel_count_type: defaultTypeForRole("ziskatel"),
          });
        }
        setLoading(false);
      });
  }, [open, userId, periodKey, availableGoalOptions, rawConfig, role]);

  const selectedKeys: (GoalKey | "")[] = [form.selected_goal_1, form.selected_goal_2].filter(Boolean) as GoalKey[];

  const handleToggleGoal = (key: GoalKey) => {
    setForm((prev) => {
      const keys = [prev.selected_goal_1, prev.selected_goal_2].filter(Boolean);
      if (keys.includes(key)) {
        if (keys.length <= 1) return prev;
        if (prev.selected_goal_1 === key)
          return { ...prev, selected_goal_1: prev.selected_goal_2 as GoalKey, selected_goal_2: "" };
        return { ...prev, selected_goal_2: "" };
      } else {
        if (!prev.selected_goal_1) return { ...prev, selected_goal_1: key };
        if (!prev.selected_goal_2) return { ...prev, selected_goal_2: key };
        return { ...prev, selected_goal_2: key };
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Strip fields that don't exist in DB schema (count_type is local-only preference for now)
    const {
      vedouci_count_type,
      budouci_vedouci_count_type,
      garant_count_type,
      ziskatel_count_type,
      ...persistableForm
    } = form;
    const payload = {
      user_id: userId,
      period_key: periodKey,
      ...persistableForm,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("vedouci_goals" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .maybeSingle();

    let error;
    if (existing) {
      const { selected_goal_1, selected_goal_2, ...goalValues } = persistableForm;
      ({ error } = await supabase
        .from("vedouci_goals" as any)
        .update({ ...goalValues, selected_goal_1, selected_goal_2 } as any)
        .eq("id", (existing as any).id));
    } else {
      ({ error } = await supabase.from("vedouci_goals" as any).insert(payload as any));
    }

    setSaving(false);
    if (error) {
      toast.error("Nepodařilo se uložit cíle");
      console.error(error);
    } else {
      toast.success("Cíle uloženy");
      onSaved();
      onClose();
    }
  };

  if (!open) return null;

  const activeGoals = availableGoalOptions.filter((g) => selectedKeys.includes(g.key));

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 64px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Target className="h-5 w-5" style={{ color: "#00abbd" }} />
          <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Cíle na období
          </h2>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Období: <strong>{periodKey}</strong> · Vyber 1–2 cíle
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Goal selector chips */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Vybrané cíle</label>
              <div className="flex flex-wrap gap-2">
                {availableGoalOptions.map((g) => {
                  const isSelected = selectedKeys.includes(g.key);
                  const slot = form.selected_goal_1 === g.key ? 1 : form.selected_goal_2 === g.key ? 2 : 0;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => handleToggleGoal(g.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: isSelected ? "#00abbd" : "var(--muted)",
                        color: isSelected ? "white" : "var(--text-secondary)",
                        border: isSelected ? "2px solid #00abbd" : "2px solid transparent",
                      }}
                    >
                      {isSelected && <Check size={12} />}
                      {g.label}
                      {isSelected && <span className="opacity-60 ml-0.5">#{slot}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Value inputs for selected goals only */}
            {activeGoals.map((g) => {
              const isPeople = PEOPLE_GOAL_KEYS.includes(g.key);
              const scopeField = `${g.key}_scope` as keyof FormData;
              const typeField = `${g.key}_type` as keyof FormData;
              const currentScope = (form as any)[scopeField] as ScopeValue | undefined;
              const currentType = (form as any)[typeField] as CountType | undefined;
              return (
                <div key={g.key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cíl: {g.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={(form as any)[g.goalField] || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [g.goalField]: parseInt(e.target.value) || 0 }))}
                    placeholder={g.placeholder}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {isPeople && (
                    <>
                      <div className="mt-2">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                          Rozsah
                        </div>
                        <div className="flex gap-2">
                          {(["direct", "structure"] as ScopeValue[]).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, [scopeField]: s }))}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                              style={{
                                background: currentScope === s ? "#00abbd" : "var(--muted)",
                                color: currentScope === s ? "white" : "var(--text-secondary)",
                              }}
                            >
                              {s === "direct" ? "Přímá linka" : "Celá struktura"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                          Způsob měření
                        </div>
                        <div className="flex gap-2">
                          {(["total", "increment"] as CountType[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, [typeField]: t }))}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                              style={{
                                background: currentType === t ? "#00abbd" : "var(--muted)",
                                color: currentType === t ? "white" : "var(--text-secondary)",
                              }}
                            >
                              {t === "total" ? "Celkový stav" : "Nový přírůstek"}
                            </button>
                          ))}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {currentType === "total"
                            ? "Aktuální počet lidí v této pozici."
                            : "Jen ti, kdo byli povýšeni během tohoto období."}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Textové shrnutí */}
            {activeGoals.some((g) => (form as any)[g.goalField] > 0) && (
              <div className="rounded-xl p-3" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">Shrnutí cílů</div>
                <ol className="list-decimal list-inside space-y-0.5">
                  {activeGoals
                    .filter((g) => (form as any)[g.goalField] > 0)
                    .map((g) => {
                      const val = (form as any)[g.goalField];
                      const isPeople = PEOPLE_GOAL_KEYS.includes(g.key);
                      const scopeField = `${g.key}_scope` as keyof FormData;
                      const scope = (form as any)[scopeField] as string;

                      let text = "";
                      if (g.key === "team_bj") {
                        text = `Napsat týmově ${val.toLocaleString("cs-CZ")} BJ.`;
                      } else if (g.key === "personal_bj") {
                        text = `Napsat osobně ${val.toLocaleString("cs-CZ")} BJ.`;
                      } else {
                        const scopeLabel = scope === "direct" ? "v přímé struktuře" : "v celé struktuře";
                        const typeField = `${g.key}_type` as keyof FormData;
                        const type = (form as any)[typeField] as CountType;
                        const noun = g.label.replace("Počet ", "");
                        text =
                          type === "increment"
                            ? `Povýšit ${scopeLabel} ${val} nových ${noun} v tomto období.`
                            : `Mít ${scopeLabel} ${val} ${noun}.`;
                      }

                      return (
                        <li key={g.key} className="text-xs" style={{ color: "var(--text-primary)" }}>
                          {text}
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-4"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Uložit cíle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
