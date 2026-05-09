import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Save, Target, UserCog, Shield } from "lucide-react";
import { toast } from "sonner";
import { ALL_METRICS, METRIC_DEFS, type MetricKey } from "@/lib/goalMetrics";
import { Checkbox } from "@/components/ui/checkbox";

const ROLES = ["vedouci", "budouci_vedouci", "garant", "ziskatel"] as const;
const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

interface GoalSetting {
  mode: "system" | "custom";
  value: number | null;
}

interface PromotionTarget {
  role: string;
  mode: "system" | "custom";
  value: number;
  scope: "direct" | "full_structure";
  type: "total" | "increment";
}

interface RoleGoals {
  monthly_bj: GoalSetting;
  fsa_weekly: GoalSetting;
  ser_weekly: GoalSetting;
  poh_weekly: GoalSetting;
  referrals_weekly: GoalSetting;
  team_bj?: GoalSetting;
  onboarding?: GoalSetting;
  promotions?: PromotionTarget[];
  allow_custom_goals?: boolean;
}

type GoalConfiguration = Record<string, RoleGoals>;

const GOAL_LABELS: Record<string, string> = {
  monthly_bj: "Měsíční BJ",
  fsa_weekly: "FSA / týden",
  ser_weekly: "SER / týden",
  poh_weekly: "POH / týden",
  referrals_weekly: "Doporučení / týden",
  ser_bj_weekly: "Servisní BJ / týden",
  lidi_na_info_weekly: "Lidi na info / týden",
  team_bj: "Týmový BJ cíl",
  onboarding: "Dokončené zapracování",
};

const BASIC_GOALS = [
  "monthly_bj",
  "fsa_weekly",
  "ser_weekly",
  "ser_bj_weekly",
  "poh_weekly",
  "referrals_weekly",
  "lidi_na_info_weekly",
] as const;

const MODE_LABELS = {
  system: "Stanoví admin",
  custom: "Stanoví uživatel",
};

const DEFAULT_CONFIG: GoalConfiguration = {
  vedouci: {
    monthly_bj: { mode: "system", value: 500 },
    fsa_weekly: { mode: "system", value: 5 },
    ser_weekly: { mode: "system", value: 2 },
    poh_weekly: { mode: "system", value: 1 },
    referrals_weekly: { mode: "system", value: 3 },
    team_bj: { mode: "system", value: 3000 },
    promotions: [
      { role: "garant", mode: "system", value: 1, scope: "direct", type: "increment" },
      { role: "budouci_vedouci", mode: "system", value: 1, scope: "full_structure", type: "total" },
    ],
    allow_custom_goals: true,
  },
  budouci_vedouci: {
    monthly_bj: { mode: "system", value: 500 },
    fsa_weekly: { mode: "system", value: 5 },
    ser_weekly: { mode: "system", value: 2 },
    poh_weekly: { mode: "system", value: 1 },
    referrals_weekly: { mode: "system", value: 3 },
    promotions: [],
    allow_custom_goals: true,
  },
  garant: {
    monthly_bj: { mode: "system", value: 400 },
    fsa_weekly: { mode: "system", value: 5 },
    ser_weekly: { mode: "system", value: 2 },
    poh_weekly: { mode: "system", value: 1 },
    referrals_weekly: { mode: "system", value: 3 },
    allow_custom_goals: false,
  },
  ziskatel: {
    monthly_bj: { mode: "system", value: 300 },
    fsa_weekly: { mode: "system", value: 4 },
    ser_weekly: { mode: "system", value: 1 },
    poh_weekly: { mode: "system", value: 1 },
    referrals_weekly: { mode: "system", value: 2 },
    allow_custom_goals: false,
  },
  novacek: {
    monthly_bj: { mode: "system", value: 200 },
    fsa_weekly: { mode: "system", value: 3 },
    ser_weekly: { mode: "system", value: 1 },
    poh_weekly: { mode: "custom", value: null },
    referrals_weekly: { mode: "system", value: 2 },
    onboarding: { mode: "system", value: 100 },
    allow_custom_goals: false,
  },
};

const PROMOTION_ROLE_OPTIONS = [
  { value: "ziskatel", label: "Získatel" },
  { value: "garant", label: "Garant" },
  { value: "budouci_vedouci", label: "Budoucí vedoucí" },
  { value: "vedouci", label: "Vedoucí" },
];

function ModeSelect({ value, onChange }: { value: "system" | "custom"; onChange: (v: "system" | "custom") => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "system" | "custom")}>
      <SelectTrigger className="h-7 text-xs w-[130px] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{MODE_LABELS.system}</SelectItem>
        <SelectItem value="custom">{MODE_LABELS.custom}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function GoalRow({
  goalKey,
  goal,
  role,
  onUpdate,
}: {
  goalKey: string;
  goal: GoalSetting;
  role: string;
  onUpdate: (field: "mode" | "value", val: any) => void;
}) {
  const isSystem = goal.mode === "system";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {isSystem ? (
          <Shield className="h-3 w-3 text-primary shrink-0" />
        ) : (
          <UserCog className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <Label className={`text-xs ${isSystem ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          {GOAL_LABELS[goalKey] || goalKey}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <ModeSelect value={goal.mode} onChange={(v) => onUpdate("mode", v)} />
        {isSystem && (
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            value={goal.value ?? 0}
            onChange={(e) => onUpdate("value", Number(e.target.value))}
          />
        )}
      </div>
    </div>
  );
}

export function GoalConfiguratorTab() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["app_config", "goal_configuration"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "goal_configuration")
        .single();
      return (data?.value as unknown as GoalConfiguration) ?? null;
    },
  });

  const [form, setForm] = useState<GoalConfiguration>(DEFAULT_CONFIG);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const mutation = useMutation({
    mutationFn: async (value: GoalConfiguration) => {
      const { data: existing } = await supabase
        .from("app_config")
        .select("id")
        .eq("key", "goal_configuration")
        .single();

      if (existing) {
        const { error } = await supabase
          .from("app_config")
          .update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() })
          .eq("key", "goal_configuration");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("app_config")
          .insert({
            key: "goal_configuration",
            value: JSON.parse(JSON.stringify(value)),
            description: "Konfigurace cílů per role (system/custom)",
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_config", "goal_configuration"] });
      toast.success("Konfigurace cílů uložena");
    },
    onError: () => toast.error("Chyba při ukládání"),
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Načítání…</p>;

  const updateGoal = (role: string, goalKey: string, field: "mode" | "value", val: any) => {
    setForm((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [goalKey]: {
          ...(prev[role]?.[goalKey as keyof RoleGoals] as GoalSetting | undefined),
          [field]: val,
        },
      },
    }));
  };

  const updatePromotion = (role: string, index: number, field: string, val: any) => {
    setForm((prev) => {
      const promotions = [...(prev[role]?.promotions || [])];
      promotions[index] = { ...promotions[index], [field]: val };
      return { ...prev, [role]: { ...prev[role], promotions } };
    });
  };

  const addPromotion = (role: string) => {
    setForm((prev) => {
      const promotions = [...(prev[role]?.promotions || [])];
      promotions.push({ role: "garant", mode: "system", value: 1, scope: "direct", type: "increment" });
      return { ...prev, [role]: { ...prev[role], promotions } };
    });
  };

  const removePromotion = (role: string, index: number) => {
    setForm((prev) => {
      const promotions = [...(prev[role]?.promotions || [])];
      promotions.splice(index, 1);
      return { ...prev, [role]: { ...prev[role], promotions } };
    });
  };

  const toggleAllowCustomGoals = (role: string) => {
    setForm((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        allow_custom_goals: !prev[role]?.allow_custom_goals,
      },
    }));
  };

  const hasPromotions = (role: string) =>
    role === "vedouci" || role === "budouci_vedouci" || role === "garant" || role === "ziskatel";

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-primary" /> Systémový cíl (stanoví admin)
        </span>
        <span className="flex items-center gap-1.5">
          <UserCog className="h-3.5 w-3.5 text-muted-foreground" /> Uživatelský cíl (stanoví si sám)
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role) => {
          const goals = form[role];
          if (!goals) return null;
          const allowCustom = goals.allow_custom_goals ?? false;

          return (
            <Card key={role}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {ROLE_LABELS[role]}
                </CardTitle>
                {/* Allow custom goals toggle */}
                <div className="flex items-center justify-between pt-2 pb-1 border-b border-border">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <UserCog className="h-3.5 w-3.5" />
                    Uživatel si může stanovit vlastní cíle
                  </Label>
                  <Switch
                    checked={allowCustom}
                    onCheckedChange={() => toggleAllowCustomGoals(role)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Onboarding goal removed — Nováček role deactivated */}

                {BASIC_GOALS.map((goalKey) => {
                  const goal = goals[goalKey];
                  if (!goal) return null;

                  return (
                    <GoalRow
                      key={goalKey}
                      goalKey={goalKey}
                      goal={goal}
                      role={role}
                      onUpdate={(field, val) => updateGoal(role, goalKey, field, val)}
                    />
                  );
                })}

                {/* Team BJ goal for vedouci */}
                {(role === "vedouci" || role === "budouci_vedouci") && goals.team_bj && (
                  <>
                    <div className="border-t border-border my-2" />
                    <GoalRow
                      goalKey="team_bj"
                      goal={goals.team_bj}
                      role={role}
                      onUpdate={(field, val) => updateGoal(role, "team_bj", field, val)}
                    />
                  </>
                )}

                {/* Promotion targets */}
                {hasPromotions(role) && (
                  <>
                    <div className="border-t border-border my-2" />
                    <Label className="text-xs font-medium">Cíle povýšení</Label>
                    {(goals.promotions || []).map((promo, idx) => (
                      <div key={idx} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={promo.role}
                            onValueChange={(v) => updatePromotion(role, idx, "role", v)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROMOTION_ROLE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            onClick={() => removePromotion(role, idx)}
                            className="text-xs text-destructive hover:text-destructive/80 px-1"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <ModeSelect
                            value={promo.mode}
                            onChange={(v) => updatePromotion(role, idx, "mode", v)}
                          />
                          {promo.mode === "system" && (
                            <Input
                              type="number"
                              className="h-7 w-14 text-xs"
                              value={promo.value}
                              onChange={(e) => updatePromotion(role, idx, "value", Number(e.target.value))}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select
                            value={promo.type || "increment"}
                            onValueChange={(v) => updatePromotion(role, idx, "type", v)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="increment">Nový přírůstek (default)</SelectItem>
                              <SelectItem value="total">Celkový stav (default)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={promo.scope}
                            onValueChange={(v) => updatePromotion(role, idx, "scope", v)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="direct">Přímí</SelectItem>
                              <SelectItem value="full_structure">Celá struktura</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-[10px] text-muted-foreground italic -mt-1">
                          Způsob měření (celkový stav / přírůstek) si nově nastavuje uživatel sám u svých cílů. Zde nastavený typ slouží jen jako výchozí předvolba.
                        </div>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addPromotion(role)}
                      className="h-7 text-xs w-full"
                    >
                      + Přidat cíl povýšení
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="gap-2">
        <Save className="h-4 w-4" /> Uložit konfiguraci cílů
      </Button>
    </div>
  );
}
