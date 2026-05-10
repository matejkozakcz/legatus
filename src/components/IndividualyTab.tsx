import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { Plus, Pencil, Trash2, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIndividualMeetings, type IndividualMeeting } from "@/hooks/useIndividualMeetings";
import { toast } from "sonner";

const roleBadgeConfig: Record<string, { label: string; className: string }> = {
  vedouci: { label: "Vedoucí", className: "role-badge role-badge-vedouci" },
  budouci_vedouci: { label: "Budoucí vedoucí", className: "role-badge role-badge-vedouci" },
  garant: { label: "Garant", className: "role-badge role-badge-garant" },
  ziskatel: { label: "Získatel", className: "role-badge role-badge-ziskatel" },
  novacek: { label: "Nováček", className: "role-badge role-badge-novacek" },
};

interface IndividualyTabProps {
  memberId: string;
}

export function IndividualyTab({ memberId }: IndividualyTabProps) {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useIndividualMeetings(memberId);

  const [editing, setEditing] = useState<null | "new" | IndividualMeeting>(null);
  const [viewing, setViewing] = useState<IndividualMeeting | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const currentUserId = user?.id;
  const orgUnitId = (profile as any)?.org_unit_id as string | null | undefined;

  const saveMutation = useMutation({
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
      setEditing(null);
      toast.success("Uloženo");
    },
    onError: (e: any) => toast.error(e?.message || "Chyba při ukládání"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("individual_meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["individual_meetings", memberId] });
      setConfirmDelete(null);
      setViewing(null);
      toast.success("Smazáno");
    },
    onError: (e: any) => toast.error(e?.message || "Chyba při mazání"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Individuály
        </p>
        <button
          onClick={() => setEditing("new")}
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
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Zatím žádné zápisky</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const isMine = r.author_id === currentUserId;
            const badge = roleBadgeConfig[r.author?.role || ""] || null;
            return (
              <button
                key={r.id}
                onClick={() => setViewing(r)}
                className="w-full text-left rounded-lg border transition-colors hover:border-[#00abbd]"
                style={{
                  padding: "10px 12px",
                  background: isMine ? "rgba(0,85,95,0.04)" : "rgba(0,0,0,0.02)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {format(new Date(r.meeting_date), "d. M. yyyy", { locale: cs })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {badge && <span className={badge.className} style={{ fontSize: 10 }}>{badge.label}</span>}
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

      {editing && (
        <RecordFormModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            saveMutation.mutate({
              id: editing === "new" ? undefined : editing.id,
              meeting_date: data.meeting_date,
              notes: data.notes,
              next_steps: data.next_steps,
            })
          }
          saving={saveMutation.isPending}
        />
      )}

      {viewing && !editing && (
        <RecordDetailModal
          record={viewing}
          canEdit={viewing.author_id === currentUserId}
          onClose={() => setViewing(null)}
          onEdit={() => setEditing(viewing)}
          onDelete={() => setConfirmDelete(viewing.id)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMutation.mutate(confirmDelete)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-card shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted"
        >
          <X size={18} style={{ color: "var(--text-muted)" }} />
        </button>
        {children}
      </div>
    </div>
  );
}

function RecordFormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: IndividualMeeting | null;
  onClose: () => void;
  onSave: (data: { meeting_date: string; notes: string; next_steps: string }) => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(initial?.meeting_date || format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [nextSteps, setNextSteps] = useState(initial?.next_steps || "");

  return (
    <ModalShell onClose={onClose}>
      <h3 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
        {initial ? "Upravit individuál" : "Nový individuál"}
      </h3>
      <div className="space-y-3">
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
      </div>
      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
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
    </ModalShell>
  );
}

function RecordDetailModal({
  record,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  record: IndividualMeeting;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = roleBadgeConfig[record.author?.role || ""] || null;
  return (
    <ModalShell onClose={onClose}>
      <p className="font-heading text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
        {format(new Date(record.meeting_date), "d. M. yyyy", { locale: cs })}
      </p>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {record.author?.full_name || "—"}
        </span>
        {badge && <span className={badge.className}>{badge.label}</span>}
        {!canEdit && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--text-muted)" }}>
            Pouze pro čtení
          </span>
        )}
      </div>
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
          Záznam
        </p>
        <div
          className="text-sm whitespace-pre-wrap leading-relaxed mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {record.notes}
        </div>
        <div className="border-t mb-3" style={{ borderColor: "var(--border)" }} />
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
          Next steps
        </p>
        {record.next_steps ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {record.next_steps}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
            Žádné next steps
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Pencil size={14} /> Upravit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: "rgba(252,124,113,0.1)", color: "#fc7c71" }}
          >
            <Trash2 size={14} /> Smazat
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  onCancel,
  onConfirm,
  loading,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 className="font-heading text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        Smazat zápis?
      </h3>
      <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
        Opravdu chceš smazat tento zápis? Tato akce je nevratná.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted"
        >
          Zrušit
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#fc7c71" }}
        >
          {loading ? "Mažu…" : "Smazat"}
        </button>
      </div>
    </ModalShell>
  );
}
