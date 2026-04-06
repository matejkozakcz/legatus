import { useState, useEffect } from "react";
import { X, Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GoalsData {
  team_bj_goal: number;
  personal_bj_goal: number;
  vedouci_count_goal: number;
  budouci_vedouci_count_goal: number;
  garant_count_goal: number;
}

const defaultGoals: GoalsData = {
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
  const [form, setForm] = useState<GoalsData>(defaultGoals);
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
          setForm({
            team_bj_goal: (data as any).team_bj_goal || 0,
            personal_bj_goal: (data as any).personal_bj_goal || 0,
            vedouci_count_goal: (data as any).vedouci_count_goal || 0,
            budouci_vedouci_count_goal: (data as any).budouci_vedouci_count_goal || 0,
            garant_count_goal: (data as any).garant_count_goal || 0,
          });
        } else {
          setForm(defaultGoals);
        }
        setLoading(false);
      });
  }, [open, userId, periodKey]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      user_id: userId,
      period_key: periodKey,
      ...form,
      updated_at: new Date().toISOString(),
    };

    // Upsert: try update first, then insert
    const { data: existing } = await supabase
      .from("vedouci_goals" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("period_key", periodKey)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("vedouci_goals" as any)
        .update(form as any)
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

  const fields: { key: keyof GoalsData; label: string; placeholder: string }[] = [
    { key: "team_bj_goal", label: "Týmové BJ", placeholder: "např. 5000" },
    { key: "personal_bj_goal", label: "Osobní BJ", placeholder: "např. 500" },
    { key: "vedouci_count_goal", label: "Počet Vedoucích", placeholder: "0" },
    { key: "budouci_vedouci_count_goal", label: "Počet Budoucích vedoucích", placeholder: "0" },
    { key: "garant_count_goal", label: "Počet Garantů", placeholder: "0" },
  ];

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
          Období: <strong>{periodKey}</strong>
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                <input
                  type="number"
                  min={0}
                  value={form[f.key] || ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))
                  }
                  placeholder={f.placeholder}
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
