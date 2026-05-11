import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Plus, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIndividualMeetings, type IndividualMeeting } from "@/hooks/useIndividualMeetings";
import { toast } from "sonner";

export { type IndividualMeeting };

export function useIndividualSave(memberId: string, onDone?: () => void) {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const orgUnitId = (profile as any)?.org_unit_id as string | null | undefined;
  const currentUserId = user?.id;
  return useMutation({
    mutationFn: async (input: { id?: string; meeting_date: string; notes: string; next_steps: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from("individual_meetings")
          .update({ notes: input.notes, next_steps: input.next_steps, meeting_date: input.meeting_date })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        if (!orgUnitId || !currentUserId) throw new Error("Chybí workspace");
        const { error } = await supabase.from("individual_meetings").insert({
          org_unit_id: orgUnitId,
          subject_id: memberId,
          author_id: currentUserId,
          meeting_date: input.meeting_date,
          notes: input.notes,
          next_steps: input.next_steps,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["individual_meetings", memberId] });
      onDone?.();
      toast.success("Uloženo");
    },
    onError: (e: any) => toast.error(e?.message || "Chyba při ukládání"),
  });
}

export function useIndividualDelete(memberId: string, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("individual_meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["individual_meetings", memberId] });
      onDone?.();
      toast.success("Smazáno");
    },
    onError: (e: any) => toast.error(e?.message || "Chyba při mazání"),
  });
}

export function IndividualFormInline({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: IndividualMeeting | null;
  onCancel: () => void;
  onSave: (data: { meeting_date: string; notes: string; next_steps: string }) => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(initial?.meeting_date || format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [nextSteps, setNextSteps] = useState(initial?.next_steps || "");

  return (
    <div className="flex flex-col gap-3 h-full">
      <h3 className="font-heading text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {initial ? "Upravit individuál" : "Nový individuál"}
      </h3>
      <div>
        <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
          Datum schůzky
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
          Záznam
        </label>
        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
        />
      </div>
      <div>
        <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
          Next steps
        </label>
        <textarea
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00abbd]"
        />
      </div>
      <div className="flex gap-2 mt-auto pt-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted"
        >
          Zrušit
        </button>
        <button
          onClick={() => onSave({ meeting_date: date, notes, next_steps: nextSteps })}
          disabled={saving || !notes.trim() || !date}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#fc7c71" }}
        >
          {saving ? "Ukládám…" : "Uložit"}
        </button>
      </div>
    </div>
  );
}

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  budouci_vedouci: { label: "Budoucí vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

interface IndividualyTabProps {
  memberId: string;
  onViewMeeting: (m: IndividualMeeting | null) => void;
  viewingId: string | null;
  editingRecord: IndividualMeeting | "new" | null;
  onSetEditing: (r: IndividualMeeting | "new" | null) => void;
  confirmDeleteId: string | null;
  onSetConfirmDelete: (id: string | null) => void;
}

export function IndividualyTab({
  memberId,
  onViewMeeting,
  viewingId,
  onSetEditing,
}: IndividualyTabProps) {
  const { user } = useAuth();
  const { data: records = [], isLoading } = useIndividualMeetings(memberId);
  const currentUserId = user?.id;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Individuály
        </p>
        <button
          onClick={() => onSetEditing("new")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#fc7c71" }}
        >
          <Plus size={14} /> Nový individuál
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Načítám…</p>
      ) : records.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Zatím žádné zápisky
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const isMine = r.author_id === currentUserId;
            const isSelected = r.id === viewingId;
            const badge = roleBadgeConfig[r.author?.role || ""] || null;
            return (
              <button
                key={r.id}
                onClick={() => onViewMeeting(isSelected ? null : r)}
                className="w-full text-left rounded-lg border transition-colors hover:border-[#00abbd]"
                style={{
                  padding: "10px 12px",
                  background: isSelected ? "rgba(0,171,189,0.08)" : isMine ? "rgba(0,85,95,0.04)" : "rgba(0,0,0,0.02)",
                  borderColor: isSelected ? "#00abbd" : "var(--border)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {format(new Date(r.meeting_date), "d. M. yyyy", { locale: cs })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {badge && (
                      <span className={badge.className} style={{ fontSize: 10 }}>
                        {badge.label}
                      </span>
                    )}
                    {!isMine && <Lock size={11} style={{ color: "var(--text-muted)" }} />}
                  </div>
                </div>
                <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
                  {r.author?.full_name || "—"}
                </p>
                <p
                  className="text-xs leading-snug"
                  style={{
                    color: "var(--text-secondary)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {r.notes}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
