import { useState, useEffect } from "react";
import { X, Loader2, Target, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type GoalKey = "team_bj" | "personal_bj" | "vedouci_count" | "budouci_vedouci_count" | "garant_count";

export const GOAL_OPTIONS: { key: GoalKey; label: string; placeholder: string; goalField: string }[] = [
  { key: "team_bj", label: "Týmové BJ", placeholder: "např. 5000", goalField: "team_bj_goal" },
  { key: "personal_bj", label: "Osobní BJ", placeholder: "např. 500", goalField: "personal_bj_goal" },
  { key: "vedouci_count", label: "Počet Vedoucích", placeholder: "0", goalField: "vedouci_count_goal" },
  { key: "budouci_vedouci_count", label: "Počet Budoucích vedoucích", placeholder: "0", goalField: "budouci_vedouci_count_goal" },
  { key: "garant_count", label: "Počet Garantů", placeholder: "0", goalField: "garant_count_goal" },
];

interface FormData {
  selected_goal_1: GoalKey;
  selected_goal_2: GoalKey;
  team_bj_goal: number;
  personal_bj_goal: number;
  vedouci_count_goal: number;
  budouci_vedouci_count_goal: number;
  garant_count_goal: number;
}

const defaultForm: FormData = {
  selected_goal_1: "team_bj",
  selected_goal_2: "personal_bj",
  team_bj_goal: 0,
  personal_bj_goal: 0,
  vedouci_count_goal: 0,
  budouci_vedouci_count_goal: 0,
  garant_count_goal: 0,
};

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  periodKey: string;
  onSaved: () => void;
}

export function VedouciGoalsModal({ open, onClose, userId, periodKey, onSaved }: Props) {
  const [form, setForm] = useState<FormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
            selected_goal_1: d.selected_goal_1 || "team_bj",
            selected_goal_2: d.selected_goal_2 || "personal_bj",
            team_bj_goal: d.team_bj_goal || 0,
            personal_bj_goal: d.personal_bj_goal || 0,
            vedouci_count_goal: d.vedouci_count_goal || 0,
            budouci_vedouci_count_goal: d.budouci_vedouci_count_goal || 0,
            garant_count_goal: d.garant_count_goal || 0,
          });
        } else {
          setForm(defaultForm);
        }
        setLoading(false);
      });
  }, [open, userId, periodKey]);

  const selectedKeys: GoalKey[] = [form.selected_goal_1, form.selected_goal_2];

  const handleSelectGoal = (slot: 1 | 2, key: GoalKey) => {
    setForm((prev) => {
      const otherSlot = slot === 1 ? "selected_goal_2" : "selected_goal_1";
      const thisSlot = slot === 1 ? "selected_goal_1" : "selected_goal_2";
      // If selecting a key that's already in the other slot, swap
      if (prev[otherSlot] === key) {
        return { ...prev, [thisSlot]: key, [otherSlot]: prev[thisSlot] };
      }
      return { ...prev, [thisSlot]: key };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      user_id: userId,
      period_key: periodKey,
      ...form,
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
      const { selected_goal_1, selected_goal_2, ...goalValues } = form;
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

  const activeGoals = GOAL_OPTIONS.filter((g) => selectedKeys.includes(g.key));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 mx-4"
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
          Období: <strong>{periodKey}</strong> · Vyber 2 cíle
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
                {GOAL_OPTIONS.map((g) => {
                  const isSelected = selectedKeys.includes(g.key);
                  const slot = form.selected_goal_1 === g.key ? 1 : form.selected_goal_2 === g.key ? 2 : 0;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        if (isSelected) return; // can't deselect, must swap
                        // Replace slot 2 with this key
                        handleSelectGoal(2, g.key);
                      }}
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
            {activeGoals.map((g) => (
              <div key={g.key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cíl: {g.label}</label>
                <input
                  type="number"
                  min={0}
                  value={(form as any)[g.goalField] || ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [g.goalField]: parseInt(e.target.value) || 0 }))
                  }
                  placeholder={g.placeholder}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}

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
