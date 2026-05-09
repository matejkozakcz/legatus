import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Target, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ALL_METRICS,
  METRIC_DEFS,
  PEOPLE_METRICS,
  type MetricKey,
  type GoalScope,
  type GoalCountType,
} from "@/lib/goalMetrics";
import { useGoalConfiguration } from "@/hooks/useGoalConfiguration";
import { useUserGoals, type UserGoal } from "@/hooks/useUserGoals";

interface UserGoalsModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  periodKey: string;
  /** true = vedoucí/admin nastavuje někomu jinému; false = uživatel sám sobě (omezeno allowed_metrics) */
  canEdit?: boolean;
  /** Role uživatele, pro kterého se nastavují cíle — určuje allowed_metrics */
  role?: string;
}

interface DraftGoal {
  metric_key: MetricKey;
  target_value: number;
  scope: GoalScope;
  count_type: GoalCountType;
}

type Tab = "periodic" | "permanent";

export function UserGoalsModal({
  open,
  onClose,
  userId,
  periodKey,
  canEdit = false,
  role,
}: UserGoalsModalProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("periodic");
  const [periodic, setPeriodic] = useState<Record<string, DraftGoal>>({});
  const [permanent, setPermanent] = useState<Record<string, DraftGoal>>({});
  const [saving, setSaving] = useState(false);

  const { rawConfig } = useGoalConfiguration(role);
  const { data: goals, isLoading, refetch } = useUserGoals(userId, periodKey);

  // Allowed metrics dle role (uživatel) — admin/vedoucí (canEdit=true) má vše
  const allowedMetrics: MetricKey[] = useMemo(() => {
    if (canEdit) return ALL_METRICS;
    if (!rawConfig || !role) return ALL_METRICS;
    const roleConfig = (rawConfig as any)[role];
    if (!roleConfig?.allow_custom_goals) return [];
    const list: string[] = roleConfig.allowed_metrics || [];
    return list.filter((m): m is MetricKey => m in METRIC_DEFS);
  }, [rawConfig, role, canEdit]);

  useEffect(() => {
    if (!open || !goals) return;
    const buildMap = (rows: UserGoal[]): Record<string, DraftGoal> => {
      const m: Record<string, DraftGoal> = {};
      rows.forEach((g) => {
        m[g.metric_key] = {
          metric_key: g.metric_key,
          target_value: g.target_value || 0,
          scope: (g.scope || "direct") as GoalScope,
          count_type: (g.count_type || "total") as GoalCountType,
        };
      });
      return m;
    };
    setPeriodic(buildMap(goals.periodicGoals));
    setPermanent(buildMap(goals.permanentGoals));
  }, [open, goals]);

  if (!open) return null;

  const activeMap = tab === "periodic" ? periodic : permanent;
  const setActiveMap = tab === "periodic" ? setPeriodic : setPermanent;

  const visibleMetrics: MetricKey[] = ALL_METRICS.filter((k) => {
    const def = METRIC_DEFS[k];
    if (tab === "periodic" && !def.periodic) return false;
    if (tab === "permanent" && !def.permanent) return false;
    return allowedMetrics.includes(k);
  });

  const toggleMetric = (k: MetricKey) => {
    setActiveMap((prev) => {
      const next = { ...prev };
      if (next[k]) {
        delete next[k];
      } else {
        next[k] = { metric_key: k, target_value: 0, scope: "direct", count_type: "total" };
      }
      return next;
    });
  };

  const updateDraft = (k: MetricKey, patch: Partial<DraftGoal>) => {
    setActiveMap((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const setBy = userData.user?.id ?? null;

      // Save periodic
      await persistTab(periodic, periodKey, userId, setBy, goals?.periodicGoals ?? []);
      // Save permanent
      await persistTab(permanent, null, userId, setBy, goals?.permanentGoals ?? []);

      toast.success("Cíle uloženy");
      qc.invalidateQueries({ queryKey: ["user_goals", userId] });
      await refetch();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Nepodařilo se uložit cíle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 pb-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4 overflow-y-auto"
        style={{ maxHeight: "calc(100dvh - 64px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5" style={{ color: "#00abbd" }} />
          <h2 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Cíle
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-4 border-b border-border">
          {(["periodic", "permanent"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? "#00abbd" : "var(--text-secondary)",
                borderBottom: tab === t ? "2px solid #00abbd" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t === "periodic" ? "Periodické cíle" : "Trvalé cíle"}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          {tab === "periodic" ? (
            <>Období: <strong>{periodKey}</strong></>
          ) : (
            <>Platí dokud se nezmění</>
          )}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleMetrics.length === 0 ? (
          <div className="rounded-xl p-4 text-xs text-muted-foreground text-center" style={{ background: "var(--muted)" }}>
            Pro tuto roli nejsou povolené žádné vlastní cíle.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chips */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Vyber cíle</label>
              <div className="flex flex-wrap gap-2">
                {visibleMetrics.map((k) => {
                  const def = METRIC_DEFS[k];
                  const active = !!activeMap[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleMetric(k)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: active ? "#00abbd" : "var(--muted)",
                        color: active ? "white" : "var(--text-secondary)",
                        border: active ? "2px solid #00abbd" : "2px solid transparent",
                      }}
                    >
                      {active && <Check size={12} />}
                      {def.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inputs for selected */}
            {Object.values(activeMap).map((draft) => {
              const def = METRIC_DEFS[draft.metric_key];
              if (!def) return null;
              const isPeople = PEOPLE_METRICS.includes(draft.metric_key);
              return (
                <div key={draft.metric_key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cíl: {def.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={draft.target_value || ""}
                    onChange={(e) => updateDraft(draft.metric_key, { target_value: parseInt(e.target.value) || 0 })}
                    placeholder={def.placeholder}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {isPeople && (
                    <>
                      <div className="mt-2">
                        <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                          Rozsah
                        </div>
                        <div className="flex gap-2">
                          {(["direct", "structure"] as GoalScope[]).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => updateDraft(draft.metric_key, { scope: s })}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                              style={{
                                background: draft.scope === s ? "#00abbd" : "var(--muted)",
                                color: draft.scope === s ? "white" : "var(--text-secondary)",
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
                          {(["total", "increment"] as GoalCountType[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateDraft(draft.metric_key, { count_type: t })}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                              style={{
                                background: draft.count_type === t ? "#00abbd" : "var(--muted)",
                                color: draft.count_type === t ? "white" : "var(--text-secondary)",
                              }}
                            >
                              {t === "total" ? "Celkový stav" : "Nový přírůstek"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Summary */}
            {Object.values(activeMap).some((g) => g.target_value > 0) && (
              <div className="rounded-xl p-3" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">Shrnutí</div>
                <ul className="space-y-0.5">
                  {Object.values(activeMap)
                    .filter((g) => g.target_value > 0)
                    .map((g) => (
                      <li key={g.metric_key} className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {METRIC_DEFS[g.metric_key].label}: <strong>{g.target_value.toLocaleString("cs-CZ")}</strong>
                        {PEOPLE_METRICS.includes(g.metric_key) && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({g.scope === "direct" ? "přímí" : "struktura"},{" "}
                            {g.count_type === "increment" ? "přírůstek" : "celkem"})
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: "#fc7c71", color: "white" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Uložit"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function persistTab(
  drafts: Record<string, DraftGoal>,
  periodKey: string | null,
  userId: string,
  setBy: string | null,
  existing: UserGoal[],
) {
  const existingByKey = new Map(existing.map((g) => [g.metric_key, g]));
  const draftKeys = new Set(Object.keys(drafts));

  // Delete: existing rows whose metric was unchecked OR target_value=0
  const toDelete: string[] = [];
  for (const ex of existing) {
    const draft = drafts[ex.metric_key];
    if (!draft || draft.target_value <= 0) toDelete.push(ex.id);
  }
  if (toDelete.length > 0) {
    await supabase.from("user_goals" as any).delete().in("id", toDelete);
  }

  // Upsert active drafts (target_value > 0)
  const upserts = Object.values(drafts)
    .filter((d) => d.target_value > 0)
    .map((d) => ({
      user_id: userId,
      metric_key: d.metric_key,
      period_key: periodKey,
      target_value: d.target_value,
      scope: d.scope,
      count_type: d.count_type,
      set_by: setBy,
      updated_at: new Date().toISOString(),
    }));

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("user_goals" as any)
      .upsert(upserts as any, { onConflict: "user_id,metric_key,period_key" });
    if (error) throw error;
  }
  void draftKeys;
  void existingByKey;
}
